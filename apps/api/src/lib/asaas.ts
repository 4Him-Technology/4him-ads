import { env } from "../env.js";

/**
 * Cliente da API do Asaas (cobrança recorrente).
 *
 * ⚠️ REGRA INEGOCIÁVEL: dado de cartão NUNCA passa por aqui.
 * Criamos a cobrança e devolvemos ao cliente o link do checkout hospedado
 * do Asaas — ele digita lá, no domínio deles. Recebemos só o status por
 * webhook. Isso nos mantém fora do escopo de PCI-DSS.
 */

const SANDBOX_URL = "https://api-sandbox.asaas.com/v3";
const PRODUCAO_URL = "https://api.asaas.com/v3";

export function asaasBaseUrl(): string {
  return env.ASAAS_ENV === "production" ? PRODUCAO_URL : SANDBOX_URL;
}

export const isAsaasConfigured = Boolean(env.ASAAS_API_KEY);

export class AsaasError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly detalhes?: unknown,
  ) {
    super(message);
    this.name = "AsaasError";
  }
}

async function chamar<T>(
  caminho: string,
  init: RequestInit & { method: string },
): Promise<T> {
  if (!env.ASAAS_API_KEY) {
    throw new AsaasError(500, "Asaas não configurado: defina ASAAS_API_KEY no .env");
  }

  const res = await fetch(`${asaasBaseUrl()}${caminho}`, {
    ...init,
    headers: {
      access_token: env.ASAAS_API_KEY,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const corpo: unknown = await res.json().catch(() => ({}));

  if (!res.ok) {
    const erros = (corpo as { errors?: { description?: string }[] }).errors;
    const msg = erros?.map((e) => e.description).join("; ") ?? `erro ${res.status}`;
    throw new AsaasError(res.status, msg, corpo);
  }

  return corpo as T;
}

// ============================================================
// Clientes
// ============================================================

export interface AsaasCustomer {
  id: string;
  name: string;
  email?: string;
  cpfCnpj?: string;
}

export function criarCliente(dados: {
  name: string;
  email?: string;
  cpfCnpj?: string;
  phone?: string;
  externalReference?: string;
}): Promise<AsaasCustomer> {
  return chamar<AsaasCustomer>("/customers", {
    method: "POST",
    body: JSON.stringify(dados),
  });
}

// ============================================================
// Assinaturas (cobrança recorrente)
// ============================================================

export type AsaasBillingType = "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED";
export type AsaasCycle = "MONTHLY" | "QUARTERLY" | "YEARLY";

export interface AsaasSubscription {
  id: string;
  customer: string;
  value: number;
  nextDueDate: string;
  cycle: AsaasCycle;
  status: string;
}

/**
 * Cria a assinatura. `billingType: "UNDEFINED"` deixa o cliente escolher
 * como pagar (Pix, boleto ou cartão) na página do Asaas — é o que evita
 * qualquer manuseio de cartão do nosso lado.
 */
export function criarAssinatura(dados: {
  customer: string;
  value: number;
  nextDueDate: string; // YYYY-MM-DD
  cycle: AsaasCycle;
  description?: string;
  externalReference?: string;
  billingType?: AsaasBillingType;
}): Promise<AsaasSubscription> {
  return chamar<AsaasSubscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({ billingType: "UNDEFINED", ...dados }),
  });
}

export function cancelarAssinatura(id: string): Promise<{ deleted: boolean }> {
  return chamar<{ deleted: boolean }>(`/subscriptions/${id}`, { method: "DELETE" });
}

// ============================================================
// Cobranças avulsas
// ============================================================

export interface AsaasPayment {
  id: string;
  customer: string;
  value: number;
  dueDate: string;
  status: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  billingType?: string;
}

export function criarCobranca(dados: {
  customer: string;
  value: number;
  dueDate: string;
  description?: string;
  externalReference?: string;
  billingType?: AsaasBillingType;
}): Promise<AsaasPayment> {
  return chamar<AsaasPayment>("/payments", {
    method: "POST",
    body: JSON.stringify({ billingType: "UNDEFINED", ...dados }),
  });
}

export function listarCobrancasDaAssinatura(subscriptionId: string) {
  return chamar<{ data: AsaasPayment[] }>(
    `/subscriptions/${subscriptionId}/payments`,
    { method: "GET" },
  );
}

// ============================================================
// Mapeamento de status Asaas → nosso domínio
// ============================================================

export function statusDaCobranca(asaas: string): "pending" | "paid" | "overdue" | "refunded" | "cancelled" {
  switch (asaas) {
    case "RECEIVED":
    case "CONFIRMED":
    case "RECEIVED_IN_CASH":
      return "paid";
    case "OVERDUE":
      return "overdue";
    case "REFUNDED":
    case "REFUND_REQUESTED":
      return "refunded";
    case "DELETED":
    case "CANCELED":
    case "CANCELLED":
      return "cancelled";
    default:
      return "pending";
  }
}

export function metodoDePagamento(asaas: string | undefined): "pix" | "boleto" | "credit_card" | "other" {
  switch (asaas) {
    case "PIX":
      return "pix";
    case "BOLETO":
      return "boleto";
    case "CREDIT_CARD":
      return "credit_card";
    default:
      return "other";
  }
}
