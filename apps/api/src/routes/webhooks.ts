import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { env } from "../env.js";
import { getServiceClient } from "../supabase.js";
import { metodoDePagamento, statusDaCobranca } from "../lib/asaas.js";

/**
 * Webhook do Asaas.
 *
 * É um endpoint PÚBLICO que altera status de pagamento — logo, o alvo mais
 * atraente do sistema. Proteções:
 *
 *  1. Token combinado, conferido em tempo constante (evita descobrir o
 *     segredo medindo o tempo de resposta).
 *  2. Idempotência: o Asaas reenvia o evento até receber 200. O id do
 *     evento é gravado com restrição de unicidade — reprocessar é ignorado.
 *  3. Responde 200 mesmo em erro interno, com o evento guardado para
 *     reprocessar depois. Assim o Asaas não fica reenviando em laço.
 *  4. Nada do corpo é confiado cegamente: o vínculo é feito pelos ids que
 *     NÓS gravamos ao criar a cobrança.
 */

interface AsaasWebhookBody {
  id?: string;
  event?: string;
  payment?: {
    id?: string;
    subscription?: string;
    customer?: string;
    value?: number;
    dueDate?: string;
    status?: string;
    billingType?: string;
    invoiceUrl?: string;
    bankSlipUrl?: string;
    description?: string;
    externalReference?: string;
    paymentDate?: string;
  };
}

/** Comparação em tempo constante — não vaza o segredo pelo tempo gasto. */
function tokenConfere(recebido: string | undefined, esperado: string): boolean {
  if (!recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function webhookRoutes(app: FastifyInstance) {
  app.post(
    "/webhooks/asaas",
    {
      // Limite generoso: em dia de vencimento chegam muitos eventos de uma vez.
      config: { rateLimit: { max: 200, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      // --- 1. Autenticação ---
      if (!env.ASAAS_WEBHOOK_TOKEN) {
        request.log.error("ASAAS_WEBHOOK_TOKEN não configurado — webhook recusado");
        return reply.code(503).send({ error: "webhook não configurado" });
      }

      const recebido = request.headers["asaas-access-token"];
      if (!tokenConfere(typeof recebido === "string" ? recebido : undefined, env.ASAAS_WEBHOOK_TOKEN)) {
        request.log.warn({ ip: request.ip }, "webhook com token inválido");
        return reply.code(401).send({ error: "não autorizado" });
      }

      const body = request.body as AsaasWebhookBody;
      const eventoId = body.id ?? body.payment?.id;
      const tipo = body.event;

      if (!eventoId || !tipo) {
        return reply.code(400).send({ error: "payload inválido" });
      }

      const service = getServiceClient();

      // --- 2. Idempotência ---
      const { error: erroInsert } = await service.from("payment_events").insert({
        provider: "asaas",
        provider_event_id: eventoId,
        event_type: tipo,
        payload: body as unknown as Record<string, unknown>,
      });

      if (erroInsert) {
        // 23505 = violação de unicidade → já processamos este evento.
        if (erroInsert.code === "23505") {
          request.log.info({ eventoId }, "webhook repetido — ignorado");
          return { ok: true, repetido: true };
        }
        request.log.error({ err: erroInsert.message }, "falha ao gravar evento");
        // Devolve 200 assim mesmo: o Asaas não deve reenviar em laço.
        return { ok: true };
      }

      // --- 3. Processamento ---
      try {
        await processarEvento(body, service);
        await service
          .from("payment_events")
          .update({ processed_at: new Date().toISOString() })
          .eq("provider_event_id", eventoId);
      } catch (err) {
        // Fica gravado com o erro, para reprocessar manualmente.
        request.log.error({ err: (err as Error).message, eventoId }, "falha ao processar webhook");
        await service
          .from("payment_events")
          .update({ error: (err as Error).message })
          .eq("provider_event_id", eventoId);
      }

      return { ok: true };
    },
  );
}

async function processarEvento(
  body: AsaasWebhookBody,
  service: ReturnType<typeof getServiceClient>,
) {
  const pagamento = body.payment;
  if (!pagamento?.id) return;

  // O vínculo vem do id que gravamos ao criar a assinatura — não de dados
  // arbitrários do corpo da requisição.
  const { data: assinatura } = pagamento.subscription
    ? await service
        .from("subscriptions")
        .select("id, org_id, client_id")
        .eq("asaas_subscription_id", pagamento.subscription)
        .maybeSingle()
    : { data: null };

  const status = statusDaCobranca(pagamento.status ?? "");
  const pago = status === "paid";

  const fatura = {
    org_id: assinatura?.org_id ?? null,
    client_id: assinatura?.client_id ?? null,
    subscription_id: assinatura?.id ?? null,
    description: pagamento.description ?? null,
    amount: pagamento.value ?? 0,
    due_date: pagamento.dueDate ?? new Date().toISOString().slice(0, 10),
    status,
    method: metodoDePagamento(pagamento.billingType),
    paid_at: pago ? (pagamento.paymentDate ?? new Date().toISOString()) : null,
    asaas_payment_id: pagamento.id,
    invoice_url: pagamento.invoiceUrl ?? null,
    bank_slip_url: pagamento.bankSlipUrl ?? null,
  };

  // Sem cliente identificado, guardamos o evento mas não criamos fatura órfã.
  if (!fatura.client_id) return;

  await service.from("invoices").upsert(fatura, { onConflict: "asaas_payment_id" });

  // --- Reflete na assinatura ---
  if (assinatura) {
    if (pago) {
      await service.from("subscriptions").update({ status: "active" }).eq("id", assinatura.id);
    } else if (status === "overdue") {
      await service.from("subscriptions").update({ status: "past_due" }).eq("id", assinatura.id);
    }
  }
}
