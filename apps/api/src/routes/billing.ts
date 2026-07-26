import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { orgIdOf, requireAdmin, requireAuth, requireStaff } from "../lib/auth-guard.js";
import { getServiceClient } from "../supabase.js";
import { env } from "../env.js";
import {
  AsaasError,
  criarAssinatura,
  criarCliente,
  cancelarAssinatura,
  isAsaasConfigured,
  metodoDePagamento,
  statusDaCobranca,
} from "../lib/asaas.js";

const criarPlanoSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  amount: z.number().nonnegative().max(1_000_000),
  cycle: z.enum(["monthly", "quarterly", "yearly"]).default("monthly"),
  spend_fee_pct: z.number().min(0).max(100).optional(),
  spend_threshold: z.number().nonnegative().optional(),
  features: z.array(z.string().max(200)).max(30).default([]),
});

const assinarSchema = z.object({
  client_id: z.string().uuid(),
  plan_id: z.string().uuid(),
  next_due_date: z.string().date(),
  /** Dados do pagador exigidos pelo Asaas. */
  cpf_cnpj: z.string().trim().min(11).max(18).optional(),
  email: z.string().email().optional(),
});

const CICLO_ASAAS = { monthly: "MONTHLY", quarterly: "QUARTERLY", yearly: "YEARLY" } as const;

export async function billingRoutes(app: FastifyInstance) {
  // ============================================================
  // Planos
  // ============================================================

  app.get("/plans", { preHandler: [requireAuth, requireStaff] }, async (request, reply) => {
    const { data, error } = await request
      .db!.from("plans")
      .select("*")
      .order("amount");

    if (error) return reply.code(500).send({ error: "erro ao listar planos" });
    return data;
  });

  app.post("/plans", { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const parsed = criarPlanoSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "dados inválidos" });

    const orgId = orgIdOf(request);
    if (!orgId) return reply.code(403).send({ error: "usuário sem organização" });

    const { data, error } = await request
      .db!.from("plans")
      .insert({ ...parsed.data, org_id: orgId })
      .select()
      .single();

    if (error) return reply.code(500).send({ error: "erro ao criar plano" });
    return reply.code(201).send(data);
  });

  // ============================================================
  // Assinaturas
  // ============================================================

  app.get("/subscriptions", { preHandler: requireAuth }, async (request, reply) => {
    const { data, error } = await request
      .db!.from("subscriptions")
      .select("*, clients(id, name), plans(id, name)")
      .order("created_at", { ascending: false });

    if (error) return reply.code(500).send({ error: "erro ao listar assinaturas" });
    return data;
  });

  /**
   * POST /subscriptions — assina um cliente a um plano.
   *
   * Cria o cadastro no Asaas e a assinatura recorrente. O cliente recebe
   * um link de checkout hospedado; NADA de cartão passa por aqui.
   */
  app.post("/subscriptions", { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const parsed = assinarSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "dados inválidos" });

    const orgId = orgIdOf(request);
    if (!orgId) return reply.code(403).send({ error: "usuário sem organização" });

    const { client_id, plan_id, next_due_date, cpf_cnpj, email } = parsed.data;

    // Confere sob RLS que quem pede enxerga o cliente e o plano.
    const [{ data: cliente }, { data: plano }] = await Promise.all([
      request.db!.from("clients").select("id, name, asaas_customer_id").eq("id", client_id).single(),
      request.db!.from("plans").select("id, name, amount, cycle").eq("id", plan_id).single(),
    ]);

    if (!cliente) return reply.code(404).send({ error: "cliente não encontrado" });
    if (!plano) return reply.code(404).send({ error: "plano não encontrado" });

    const service = getServiceClient();

    // Sem Asaas configurado, registra localmente (modo manual/simulado).
    if (!isAsaasConfigured) {
      const { data, error } = await service
        .from("subscriptions")
        .insert({
          org_id: orgId,
          client_id,
          plan_id,
          amount: plano.amount,
          cycle: plano.cycle,
          next_due_date,
          status: "trialing",
        })
        .select()
        .single();

      if (error) return reply.code(500).send({ error: "erro ao criar assinatura" });
      return reply.code(201).send({ ...data, aviso: "Asaas não configurado — assinatura só local" });
    }

    try {
      // 1. Cadastro do pagador no Asaas (reaproveita se já existir)
      let asaasCustomerId = cliente.asaas_customer_id;
      if (!asaasCustomerId) {
        const criado = await criarCliente({
          name: cliente.name,
          email,
          cpfCnpj: cpf_cnpj,
          externalReference: cliente.id,
        });
        asaasCustomerId = criado.id;
        await service.from("clients").update({ asaas_customer_id: asaasCustomerId }).eq("id", cliente.id);
      }

      // 2. Assinatura recorrente
      const assinatura = await criarAssinatura({
        customer: asaasCustomerId,
        value: Number(plano.amount),
        nextDueDate: next_due_date,
        cycle: CICLO_ASAAS[plano.cycle as keyof typeof CICLO_ASAAS],
        description: `${plano.name} — ${cliente.name}`,
        externalReference: cliente.id,
      });

      // 3. Registro local
      const { data, error } = await service
        .from("subscriptions")
        .insert({
          org_id: orgId,
          client_id,
          plan_id,
          amount: plano.amount,
          cycle: plano.cycle,
          next_due_date,
          status: "active",
          asaas_subscription_id: assinatura.id,
          asaas_customer_id: asaasCustomerId,
        })
        .select()
        .single();

      if (error) throw new Error(error.message);

      request.log.info(
        { clientId: cliente.id, subscriptionId: data.id, por: request.ctx?.profile.id },
        "assinatura criada",
      );
      return reply.code(201).send(data);
    } catch (err) {
      const msg = err instanceof AsaasError ? err.message : "falha ao criar assinatura";
      request.log.error({ err: (err as Error).message }, "erro na assinatura");
      return reply.code(502).send({ error: msg });
    }
  });

  app.delete<{ Params: { id: string } }>(
    "/subscriptions/:id",
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const service = getServiceClient();
      const { data: assinatura } = await request
        .db!.from("subscriptions")
        .select("id, asaas_subscription_id")
        .eq("id", request.params.id)
        .single();

      if (!assinatura) return reply.code(404).send({ error: "assinatura não encontrada" });

      if (assinatura.asaas_subscription_id && isAsaasConfigured) {
        try {
          await cancelarAssinatura(assinatura.asaas_subscription_id);
        } catch (err) {
          request.log.error({ err: (err as Error).message }, "falha ao cancelar no Asaas");
        }
      }

      await service
        .from("subscriptions")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", assinatura.id);

      return { ok: true };
    },
  );

  // ============================================================
  // Faturas
  // ============================================================

  app.get("/invoices", { preHandler: requireAuth }, async (request, reply) => {
    const { data, error } = await request
      .db!.from("invoices")
      .select("*, clients(id, name)")
      .order("due_date", { ascending: false })
      .limit(200);

    if (error) return reply.code(500).send({ error: "erro ao listar faturas" });
    return data;
  });

  // ============================================================
  // Panorama financeiro
  // ============================================================

  app.get("/billing/summary", { preHandler: [requireAuth, requireStaff] }, async (request, reply) => {
    const { data, error } = await request.db!.rpc("resumo_financeiro");

    if (error) {
      request.log.error({ err: error.message }, "falha no resumo financeiro");
      return reply.code(500).send({ error: "erro ao carregar resumo" });
    }
    return data;
  });

  /**
   * GET /subscriptions/:id/variable — prévia da parte variável do período.
   *
   * Apenas calcula e mostra a conta aberta; não gera cobrança. A fatura só
   * sai depois que a equipe confere, para nunca faturar em cima de dado
   * errado (métrica não sincronizada, rastreamento quebrado etc.).
   */
  app.get<{ Params: { id: string }; Querystring: { inicio?: string; fim?: string } }>(
    "/subscriptions/:id/variable",
    { preHandler: [requireAuth, requireStaff] },
    async (request, reply) => {
      const hoje = new Date();
      const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

      const inicio = request.query.inicio ?? primeiroDia.toISOString().slice(0, 10);
      const fim = request.query.fim ?? ultimoDia.toISOString().slice(0, 10);

      const { data, error } = await request.db!.rpc("calcular_variavel", {
        p_subscription: request.params.id,
        p_inicio: inicio,
        p_fim: fim,
      });

      if (error) {
        request.log.error({ err: error.message }, "falha ao apurar parte variável");
        return reply.code(500).send({ error: "erro ao apurar" });
      }

      const linha = Array.isArray(data) ? data[0] : data;
      // Plano sem parte variável devolve vazio — a interface trata como "só fixo".
      return linha ?? null;
    },
  );
}
