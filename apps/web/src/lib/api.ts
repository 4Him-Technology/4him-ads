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

export interface Client {
  id: string;
  name: string;
  slug: string;
  status: "active" | "paused" | "archived";
  currency: string;
  timezone: string;
  brand_color: string | null;
  created_at: string;
}

export interface NovoCliente {
  name: string;
  slug: string;
  currency?: string;
  timezone?: string;
}

export function fetchClients(): Promise<Client[]> {
  return request<Client[]>("/clients");
}

export function createClient(dados: NovoCliente): Promise<Client> {
  return request<Client>("/clients", { method: "POST", body: JSON.stringify(dados) });
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
