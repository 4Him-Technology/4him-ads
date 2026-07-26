import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import { z } from "zod";
import {
  orgIdOf,
  requireAuth,
  requireAdmin,
  requireRole,
  requireStaff,
} from "../lib/auth-guard.js";
import { getServiceClient } from "../supabase.js";
import {
  criarAssinatura,
  criarCliente as criarClienteAsaas,
  criarCobranca,
  isAsaasConfigured,
} from "../lib/asaas.js";

const vazioParaNulo = (v: unknown) => (v === "" ? undefined : v);

const criarClienteSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "use apenas minúsculas, números e hífens"),
  currency: z.string().length(3).default("BRL"),
  timezone: z.string().max(60).default("America/Sao_Paulo"),
  brand_color: z.preprocess(vazioParaNulo, z.string().max(20).optional()),
  // Cadastro
  document: z.preprocess(vazioParaNulo, z.string().trim().max(20).optional()),
  contact_name: z.preprocess(vazioParaNulo, z.string().trim().max(120).optional()),
  contact_email: z.preprocess(vazioParaNulo, z.string().trim().email().max(320).optional()),
  contact_phone: z.preprocess(vazioParaNulo, z.string().trim().max(30).optional()),
  segment: z.preprocess(vazioParaNulo, z.string().trim().max(80).optional()),
  notes: z.preprocess(vazioParaNulo, z.string().trim().max(2000).optional()),
  ad_account_model: z.enum(["client_owned", "agency_owned"]).default("agency_owned"),
  meta_business_id: z.preprocess(vazioParaNulo, z.string().trim().max(40).optional()),
  // Briefing — contexto enviado à IA para sugerir palavras-chave e criativos.
  business_description: z.preprocess(vazioParaNulo, z.string().trim().max(4000).optional()),
  target_audience: z.preprocess(vazioParaNulo, z.string().trim().max(2000).optional()),
  value_proposition: z.preprocess(vazioParaNulo, z.string().trim().max(2000).optional()),
  main_products: z.preprocess(vazioParaNulo, z.string().trim().max(2000).optional()),
  service_area: z.preprocess(vazioParaNulo, z.string().trim().max(500).optional()),
  avg_ticket: z.number().nonnegative().max(10_000_000).optional(),
  campaign_goal: z.preprocess(vazioParaNulo, z.string().trim().max(60).optional()),
  competitors: z.array(z.string().trim().max(120)).max(30).optional(),
  seed_keywords: z.array(z.string().trim().max(120)).max(60).optional(),
  restrictions: z.preprocess(vazioParaNulo, z.string().trim().max(2000).optional()),
  website: z.preprocess(vazioParaNulo, z.string().trim().max(300).optional()),
});

/** Condições comerciais negociadas — tudo opcional, herda do plano quando ausente. */
const contratoSchema = z.object({
  plan_id: z.string().uuid(),
  amount: z.number().nonnegative().max(1_000_000),
  setup_fee: z.number().nonnegative().max(1_000_000).optional(),
  cycle: z.enum(["monthly", "quarterly", "yearly"]).default("monthly"),
  next_due_date: z.string().date(),
  variable_metric: z.enum(["ad_spend", "revenue", "conversions", "leads"]).optional(),
  variable_pct: z.number().min(0).max(100).optional(),
  variable_threshold: z.number().nonnegative().optional(),
  variable_cap: z.number().nonnegative().optional(),
  variable_grace_months: z.number().int().min(0).max(24).optional(),
  notes: z.preprocess(vazioParaNulo, z.string().trim().max(2000).optional()),
});

const cadastroCompletoSchema = z.object({
  cliente: criarClienteSchema,
  contrato: contratoSchema.optional(),
});

const atualizarClienteSchema = criarClienteSchema
  .partial()
  .omit({ slug: true })
  .extend({ status: z.enum(["active", "paused", "archived"]).optional() });

const CICLO_ASAAS = { monthly: "MONTHLY", quarterly: "QUARTERLY", yearly: "YEARLY" } as const;

/**
 * Cria a assinatura com as condições NEGOCIADAS e, havendo implantação,
 * a cobrança avulsa dela.
 *
 * Usa service role de propósito: as rotas que chamam isto já validaram o
 * papel de quem pediu, e precisamos escrever campos que o RLS de escrita
 * do usuário não cobriria (vínculo com o provedor de pagamento).
 */
async function criarAssinaturaNegociada(params: {
  orgId: string;
  cliente: { id: string; name: string };
  contrato: z.infer<typeof contratoSchema>;
  documento?: string | undefined;
  email?: string | undefined;
  log: FastifyBaseLogger;
}) {
  const { orgId, cliente, contrato, documento, email, log } = params;
  const service = getServiceClient();

  let asaasCustomerId: string | null = null;
  let asaasSubscriptionId: string | null = null;

  if (isAsaasConfigured) {
    const criado = await criarClienteAsaas({
      name: cliente.name,
      email,
      cpfCnpj: documento,
      externalReference: cliente.id,
    });
    asaasCustomerId = criado.id;
    await service.from("clients").update({ asaas_customer_id: criado.id }).eq("id", cliente.id);

    const assinatura = await criarAssinatura({
      customer: criado.id,
      value: contrato.amount,
      nextDueDate: contrato.next_due_date,
      cycle: CICLO_ASAAS[contrato.cycle],
      description: `Mensalidade — ${cliente.name}`,
      externalReference: cliente.id,
    });
    asaasSubscriptionId = assinatura.id;

    // Implantação: cobrança única, separada da recorrência.
    if (contrato.setup_fee && contrato.setup_fee > 0) {
      try {
        const cobranca = await criarCobranca({
          customer: criado.id,
          value: contrato.setup_fee,
          dueDate: contrato.next_due_date,
          description: `Implantação — ${cliente.name}`,
          externalReference: cliente.id,
        });
        await service.from("invoices").insert({
          org_id: orgId,
          client_id: cliente.id,
          description: `Implantação — ${cliente.name}`,
          amount: contrato.setup_fee,
          due_date: contrato.next_due_date,
          status: "pending",
          asaas_payment_id: cobranca.id,
          invoice_url: cobranca.invoiceUrl ?? null,
          bank_slip_url: cobranca.bankSlipUrl ?? null,
        });
      } catch (err) {
        // A mensalidade é o que sustenta o contrato; a implantação pode
        // ser refeita manualmente sem desfazer tudo.
        log.error({ err: (err as Error).message }, "implantação não pôde ser cobrada");
      }
    }
  }

  const { data, error } = await service
    .from("subscriptions")
    .insert({
      org_id: orgId,
      client_id: cliente.id,
      plan_id: contrato.plan_id,
      amount: contrato.amount,
      cycle: contrato.cycle,
      next_due_date: contrato.next_due_date,
      status: isAsaasConfigured ? "active" : "trialing",
      setup_fee: contrato.setup_fee ?? null,
      variable_metric: contrato.variable_metric ?? null,
      variable_pct: contrato.variable_pct ?? null,
      variable_threshold: contrato.variable_threshold ?? null,
      variable_cap: contrato.variable_cap ?? null,
      variable_grace_months: contrato.variable_grace_months ?? null,
      notes: contrato.notes ?? null,
      asaas_subscription_id: asaasSubscriptionId,
      asaas_customer_id: asaasCustomerId,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function clientRoutes(app: FastifyInstance) {
  /**
   * GET /clients — clientes visíveis para quem chamou.
   * O RLS já filtra: staff vê os da organização, usuário-cliente vê só os seus.
   */
  app.get("/clients", { preHandler: requireAuth }, async (request, reply) => {
    // Traz o contrato junto: a tela de clientes é o painel central de
    // gestão, e ver a situação financeira ali evita ir e voltar.
    const { data, error } = await request
      .db!.from("clients")
      .select(
        `id, name, slug, status, currency, timezone, brand_color, created_at,
         document, contact_name, contact_email, contact_phone, segment, notes,
         ad_account_model, meta_business_id, billing_health,
         subscriptions(id, status, amount, cycle, setup_fee, next_due_date,
                       variable_metric, variable_pct, variable_threshold,
                       variable_grace_months, started_at, notes,
                       plans(id, name))`,
      )
      .order("name");

    if (error) {
      request.log.error({ err: error.message }, "falha ao listar clientes");
      return reply.code(500).send({ error: "erro ao listar clientes" });
    }
    return data;
  });

  /**
   * POST /clients — cria cliente.
   *
   * O `org_id` vem SEMPRE da sessão, nunca do corpo da requisição —
   * assim ninguém cria cliente dentro da organização de outra agência.
   */
  app.post(
    "/clients",
    { preHandler: [requireAuth, requireRole("owner", "admin", "manager")] },
    async (request, reply) => {
      const parsed = criarClienteSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "dados inválidos",
          detalhes: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        });
      }

      const orgId = orgIdOf(request);
      if (!orgId) return reply.code(403).send({ error: "usuário sem organização" });

      const { data, error } = await request
        .db!.from("clients")
        .insert({ ...parsed.data, org_id: orgId })
        .select("id, name, slug, status, currency, timezone")
        .single();

      if (error) {
        if (error.code === "23505") {
          return reply.code(409).send({ error: "já existe um cliente com esse identificador" });
        }
        request.log.error({ err: error.message }, "falha ao criar cliente");
        return reply.code(500).send({ error: "erro ao criar cliente" });
      }

      request.log.info({ clientId: data.id, por: request.ctx?.profile.id }, "cliente criado");
      return reply.code(201).send(data);
    },
  );

  /** PATCH /clients/:id — atualiza dados do cliente. */
  app.patch<{ Params: { id: string } }>(
    "/clients/:id",
    { preHandler: [requireAuth, requireRole("owner", "admin", "manager")] },
    async (request, reply) => {
      const parsed = atualizarClienteSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "dados inválidos" });
      }

      const { data, error } = await request
        .db!.from("clients")
        .update(parsed.data)
        .eq("id", request.params.id)
        .select("id, name, slug, status, currency, timezone")
        .single();

      // Sem linha retornada = o RLS barrou ou o id não existe. Mesma resposta
      // nos dois casos, para não revelar a existência de clientes de terceiros.
      if (error || !data) {
        return reply.code(404).send({ error: "cliente não encontrado" });
      }
      return data;
    },
  );

  /**
   * POST /clients/full — cadastra o cliente e o contrato de uma vez.
   *
   * É o que a tela de cadastro em duas colunas usa: dados do cliente à
   * esquerda, condições comerciais à direita. As condições ficam gravadas
   * NA ASSINATURA, não no plano — o plano é só o modelo de referência,
   * e negociar é a regra.
   *
   * Se a criação do contrato falhar, o cliente permanece cadastrado e a
   * resposta avisa: é melhor do que perder o cadastro inteiro.
   */
  app.post(
    "/clients/full",
    { preHandler: [requireAuth, requireRole("owner", "admin", "manager")] },
    async (request, reply) => {
      const parsed = cadastroCompletoSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "dados inválidos",
          detalhes: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        });
      }

      const orgId = orgIdOf(request);
      if (!orgId) return reply.code(403).send({ error: "usuário sem organização" });

      const { cliente, contrato } = parsed.data;

      const { data: novoCliente, error: erroCliente } = await request
        .db!.from("clients")
        .insert({ ...cliente, org_id: orgId })
        .select("id, name, slug, status, currency, timezone, document, contact_email")
        .single();

      if (erroCliente || !novoCliente) {
        if (erroCliente?.code === "23505") {
          return reply.code(409).send({ error: "já existe um cliente com esse identificador" });
        }
        request.log.error({ err: erroCliente?.message }, "falha ao criar cliente");
        return reply.code(500).send({ error: "erro ao criar cliente" });
      }

      request.log.info({ clientId: novoCliente.id, por: request.ctx?.profile.id }, "cliente criado");

      if (!contrato) {
        return reply.code(201).send({ cliente: novoCliente, contrato: null });
      }

      try {
        const assinatura = await criarAssinaturaNegociada({
          orgId,
          cliente: novoCliente,
          contrato,
          documento: cliente.document,
          email: cliente.contact_email,
          log: request.log,
        });
        return reply.code(201).send({ cliente: novoCliente, contrato: assinatura });
      } catch (err) {
        request.log.error({ err: (err as Error).message }, "cliente criado, contrato falhou");
        return reply.code(201).send({
          cliente: novoCliente,
          contrato: null,
          aviso: `Cliente cadastrado, mas o contrato não pôde ser criado: ${(err as Error).message}`,
        });
      }
    },
  );

  /** GET /clients/:id/access — quem tem acesso a este cliente. */
  app.get<{ Params: { id: string } }>(
    "/clients/:id/access",
    { preHandler: [requireAuth, requireStaff] },
    async (request, reply) => {
      const { data, error } = await request
        .db!.from("client_access")
        .select("id, can_edit, created_at, profiles(id, email, full_name)")
        .eq("client_id", request.params.id);

      if (error) {
        request.log.error({ err: error.message }, "falha ao listar acessos");
        return reply.code(500).send({ error: "erro ao listar acessos" });
      }
      return data;
    },
  );

  /** DELETE /clients/:id/access/:accessId — revoga o acesso de um usuário. */
  app.delete<{ Params: { id: string; accessId: string } }>(
    "/clients/:id/access/:accessId",
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const { error } = await request
        .db!.from("client_access")
        .delete()
        .eq("id", request.params.accessId)
        .eq("client_id", request.params.id);

      if (error) {
        return reply.code(500).send({ error: "erro ao revogar acesso" });
      }
      request.log.info(
        { accessId: request.params.accessId, por: request.ctx?.profile.id },
        "acesso revogado",
      );
      return { ok: true };
    },
  );
}
