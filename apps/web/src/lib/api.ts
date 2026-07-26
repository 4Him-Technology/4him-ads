/**
 * Cliente da nossa API.
 *
 * O front NÃO tem credenciais nem variáveis de ambiente: qualquer valor
 * embutido aqui (inclusive `VITE_*`) iria parar no bundle público. Falamos
 * apenas com a nossa própria API, por caminho relativo `/api`.
 * Em dev o Vite faz proxy de `/api` → http://localhost:3333.
 *
 * A sessão viaja em cookie httpOnly: este código nunca vê o token.
 */
const API_BASE = "/api";

/** A API exige este cabeçalho em requisições que alteram estado (anti-CSRF). */
const APP_HEADER = { "x-4him-app": "web" };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...APP_HEADER,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const body: unknown = await res.json().catch(() => ({}));

  if (!res.ok) {
    const payload = body as { error?: string; retryAfterSeconds?: number };
    throw new ApiError(
      res.status,
      payload.error ?? `Falha na requisição (${res.status})`,
      payload.retryAfterSeconds,
    );
  }

  return body as T;
}

// ============================================================
// Saúde
// ============================================================

export interface HealthResponse {
  status: string;
}

/**
 * Só confirma que a API responde. Deliberadamente não expõe qual banco
 * ou tecnologia está por trás — isso ajudaria quem procura vulnerabilidades.
 */
export function fetchHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}

// ============================================================
// Autenticação
// ============================================================

export interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  is_agency_staff: boolean;
}

export interface UserOrganization {
  org_id: string;
  role: "owner" | "admin" | "manager" | "analyst" | "client";
  org_name: string;
  org_slug: string;
}

export interface UserClient {
  id: string;
  name: string;
  slug: string;
  status: string;
  currency: string;
}

export interface UserContext {
  profile: UserProfile;
  organizations: UserOrganization[];
  clients: UserClient[];
}

export function login(email: string, password: string): Promise<{ ok: true }> {
  return request<{ ok: true }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function logout(): Promise<{ ok: true }> {
  return request<{ ok: true }>("/auth/logout", { method: "POST" });
}

/**
 * Quem está logado — ou `null` se não houver sessão.
 *
 * Não estar logado é um estado normal do app, não um erro: por isso o 401
 * vira `null` em vez de exceção. Só falha de verdade (rede, 500) lança.
 */
export async function fetchMe(): Promise<UserContext | null> {
  const res = await fetch(`${API_BASE}/auth/me`, {
    credentials: "include",
    headers: APP_HEADER,
  });

  if (res.status === 401) return null;

  if (!res.ok) {
    throw new ApiError(res.status, "Não foi possível carregar o usuário");
  }
  return (await res.json()) as UserContext;
}

// ============================================================
// Clientes
// ============================================================

/** Contrato do cliente. Os valores aqui são os NEGOCIADOS, não os do plano. */
export interface ClientSubscription {
  id: string;
  status: SubscriptionStatus;
  amount: number;
  cycle: BillingCycle;
  setup_fee: number | null;
  next_due_date: string | null;
  started_at: string;
  variable_metric: BillingMetric | null;
  variable_pct: number | null;
  variable_threshold: number | null;
  variable_grace_months: number | null;
  notes: string | null;
  plans: { id: string; name: string } | null;
}

export interface Client {
  id: string;
  name: string;
  slug: string;
  status: "active" | "paused" | "archived";
  currency: string;
  timezone: string;
  brand_color: string | null;
  created_at: string;
  document: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  segment: string | null;
  notes: string | null;
  ad_account_model: "client_owned" | "agency_owned";
  meta_business_id: string | null;
  billing_health: "unknown" | "ok" | "missing" | "failing";
  subscriptions: ClientSubscription[];
  // Briefing — contexto para a IA
  business_description: string | null;
  target_audience: string | null;
  value_proposition: string | null;
  main_products: string | null;
  service_area: string | null;
  avg_ticket: number | null;
  campaign_goal: string | null;
  competitors: string[] | null;
  seed_keywords: string[] | null;
  restrictions: string | null;
  website: string | null;
}

export interface NovoCliente {
  name: string;
  slug: string;
  currency?: string;
  timezone?: string;
  document?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  segment?: string;
  notes?: string;
  ad_account_model?: "client_owned" | "agency_owned";
  business_description?: string;
  target_audience?: string;
  value_proposition?: string;
  main_products?: string;
  service_area?: string;
  avg_ticket?: number;
  campaign_goal?: string;
  competitors?: string[];
  seed_keywords?: string[];
  restrictions?: string;
  website?: string;
}

export interface NovoContrato {
  plan_id: string;
  amount: number;
  setup_fee?: number;
  next_due_date: string;
  cycle?: BillingCycle;
  variable_metric?: BillingMetric;
  variable_pct?: number;
  variable_threshold?: number;
  variable_grace_months?: number;
  notes?: string;
}

export interface CadastroCompletoResultado {
  cliente: { id: string; name: string; slug: string };
  contrato: { id: string; amount: number; setup_fee: number | null } | null;
  aviso?: string;
}

export function fetchClients(): Promise<Client[]> {
  return request<Client[]>("/clients");
}

export function createClient(dados: NovoCliente): Promise<Client> {
  return request<Client>("/clients", { method: "POST", body: JSON.stringify(dados) });
}

/** Cadastra cliente e contrato numa única operação (tela de duas colunas). */
export function createClientFull(dados: {
  cliente: NovoCliente;
  contrato?: NovoContrato;
}): Promise<CadastroCompletoResultado> {
  return request<CadastroCompletoResultado>("/clients/full", {
    method: "POST",
    body: JSON.stringify(dados),
  });
}

/** Renegocia as condições de um contrato existente. */
export function updateSubscription(
  id: string,
  dados: Partial<{
    amount: number;
    setup_fee: number | null;
    next_due_date: string;
    variable_metric: BillingMetric | null;
    variable_pct: number | null;
    variable_threshold: number | null;
    variable_grace_months: number | null;
    notes: string | null;
  }>,
): Promise<ClientSubscription> {
  return request<ClientSubscription>(`/subscriptions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(dados),
  });
}

export function updateClient(id: string, dados: Partial<NovoCliente> & { status?: string }) {
  return request<Client>(`/clients/${id}`, { method: "PATCH", body: JSON.stringify(dados) });
}

export interface ClientAccess {
  id: string;
  can_edit: boolean;
  created_at: string;
  profiles: { id: string; email: string; full_name: string | null } | null;
}

export function fetchClientAccess(clientId: string): Promise<ClientAccess[]> {
  return request<ClientAccess[]>(`/clients/${clientId}/access`);
}

export function revokeClientAccess(clientId: string, accessId: string) {
  return request<{ ok: true }>(`/clients/${clientId}/access/${accessId}`, { method: "DELETE" });
}

// ============================================================
// Usuários e convites
// ============================================================

export interface Membership {
  id: string;
  role: UserOrganization["role"];
  created_at: string;
  profiles: { id: string; email: string; full_name: string | null; is_agency_staff: boolean } | null;
}

export interface ConviteResultado {
  email: string;
  nome: string;
  senhaTemporaria: string | null;
  jaExistia: boolean;
  role?: string;
  cliente?: string;
}

export function fetchUsers(): Promise<Membership[]> {
  return request<Membership[]>("/users");
}

export function inviteTeamMember(dados: {
  email: string;
  nome: string;
  role: "admin" | "manager" | "analyst";
}): Promise<ConviteResultado> {
  return request<ConviteResultado>("/users/invite", {
    method: "POST",
    body: JSON.stringify(dados),
  });
}

export function inviteClientUser(
  clientId: string,
  dados: { email: string; nome: string; can_edit?: boolean },
): Promise<ConviteResultado> {
  return request<ConviteResultado>(`/clients/${clientId}/invite`, {
    method: "POST",
    body: JSON.stringify(dados),
  });
}

// ============================================================
// Cobrança
// ============================================================

export type BillingCycle = "monthly" | "quarterly" | "yearly";
export type BillingMetric = "ad_spend" | "revenue" | "conversions" | "leads";
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "suspended"
  | "cancelled";
export type InvoiceStatus = "pending" | "paid" | "overdue" | "refunded" | "cancelled";

export interface Plan {
  id: string;
  name: string;
  description: string | null;
  amount: number;
  cycle: BillingCycle;
  variable_metric: BillingMetric | null;
  variable_threshold: number | null;
  variable_pct: number | null;
  variable_cap: number | null;
  variable_grace_months: number;
  features: string[];
  is_active: boolean;
}

export interface Subscription {
  id: string;
  client_id: string;
  plan_id: string | null;
  status: SubscriptionStatus;
  amount: number;
  cycle: BillingCycle;
  started_at: string;
  next_due_date: string | null;
  asaas_subscription_id: string | null;
  clients: { id: string; name: string } | null;
  plans: { id: string; name: string } | null;
}

export interface Invoice {
  id: string;
  client_id: string;
  description: string | null;
  amount: number;
  due_date: string;
  paid_at: string | null;
  status: InvoiceStatus;
  method: string | null;
  invoice_url: string | null;
  clients: { id: string; name: string } | null;
}

export interface BillingSummary {
  mrr: number;
  assinaturas_ativas: number;
  em_carencia: number;
  inadimplentes: number;
  a_receber: number;
  vencidas: number;
  recebido_mes: number;
}

/** Prévia da parte variável — só cálculo, não gera cobrança. */
export interface VariablePreview {
  metric: BillingMetric;
  metric_value: number;
  threshold: number;
  pct: number;
  excedente: number;
  amount: number;
  em_carencia: boolean;
  carencia_ate: string;
}

export function fetchPlans(): Promise<Plan[]> {
  return request<Plan[]>("/plans");
}

export function createPlan(dados: {
  name: string;
  description?: string;
  amount: number;
  cycle?: BillingCycle;
  variable_metric?: BillingMetric;
  variable_threshold?: number;
  variable_pct?: number;
  features?: string[];
}): Promise<Plan> {
  return request<Plan>("/plans", { method: "POST", body: JSON.stringify(dados) });
}

export function fetchSubscriptions(): Promise<Subscription[]> {
  return request<Subscription[]>("/subscriptions");
}

export function createSubscription(dados: {
  client_id: string;
  plan_id: string;
  next_due_date: string;
  cpf_cnpj?: string;
  email?: string;
}): Promise<Subscription> {
  return request<Subscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify(dados),
  });
}

export function cancelSubscription(id: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/subscriptions/${id}`, { method: "DELETE" });
}

export function fetchInvoices(): Promise<Invoice[]> {
  return request<Invoice[]>("/invoices");
}

export function fetchBillingSummary(): Promise<BillingSummary> {
  return request<BillingSummary>("/billing/summary");
}

export function fetchVariablePreview(subscriptionId: string): Promise<VariablePreview | null> {
  return request<VariablePreview | null>(`/subscriptions/${subscriptionId}/variable`);
}
