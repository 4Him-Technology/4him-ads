import type { FastifyReply, FastifyRequest } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthClient, createUserClient } from "../supabase.js";
import {
  SESSION_COOKIE,
  isExpired,
  openSession,
  sealSession,
  sessionCookieOptions,
  type SessionData,
} from "./session.js";

export type MembershipRole = "owner" | "admin" | "manager" | "analyst" | "client";

export interface UserContext {
  profile: {
    id: string;
    email: string;
    full_name: string | null;
    is_agency_staff: boolean;
  };
  organizations: { org_id: string; role: MembershipRole; org_name: string; org_slug: string }[];
  clients: { id: string; name: string; slug: string; status: string; currency: string }[];
}

declare module "fastify" {
  interface FastifyRequest {
    /** Sessão válida do usuário. Só existe após `requireAuth`. */
    session?: SessionData;
    /** Client Supabase no contexto do usuário — respeita RLS. */
    db?: SupabaseClient;
    /** Perfil, papéis e clientes. Preenchido por `requireRole`. */
    ctx?: UserContext;
  }
}

function clearSession(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

/**
 * Exige usuário autenticado.
 *
 * Fluxo: lê o cookie → decifra → se expirou, renova pelo refresh token →
 * anexa à requisição um client Supabase que roda COMO o usuário.
 *
 * Qualquer falha resulta em 401 genérico: não revelamos se o cookie estava
 * ausente, expirado ou adulterado.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const raw = request.cookies[SESSION_COOKIE];
  let session = openSession(raw);

  if (!session) {
    clearSession(reply);
    return reply.code(401).send({ error: "não autenticado" });
  }

  // Token vencido → tenta renovar silenciosamente.
  if (isExpired(session)) {
    const { data, error } = await getAuthClient().auth.refreshSession({
      refresh_token: session.refreshToken,
    });

    if (error || !data.session) {
      clearSession(reply);
      return reply.code(401).send({ error: "sessão expirada" });
    }

    session = {
      userId: data.session.user.id,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    };
    reply.setCookie(SESSION_COOKIE, sealSession(session), sessionCookieOptions());
  }

  request.session = session;
  request.db = createUserClient(session.accessToken);
}

/**
 * Exige que o usuário tenha um dos papéis informados.
 *
 * O papel é lido do BANCO a cada requisição (sob RLS), nunca de algo que
 * o cliente envie. Assim não há como se promover mexendo no navegador.
 *
 * Uso: `{ preHandler: [requireAuth, requireRole("owner", "admin")] }`
 */
export function requireRole(...papeis: MembershipRole[]) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    if (!request.db) {
      return reply.code(401).send({ error: "não autenticado" });
    }

    const { data, error } = await request.db.rpc("current_user_context");
    if (error || !data) {
      return reply.code(401).send({ error: "não autenticado" });
    }

    const ctx = data as UserContext;
    request.ctx = ctx;

    const papelAtual = ctx.organizations[0]?.role;
    if (!papelAtual || !papeis.includes(papelAtual)) {
      request.log.warn(
        { userId: ctx.profile.id, papelAtual, exigido: papeis },
        "acesso negado por papel",
      );
      return reply.code(403).send({ error: "sem permissão para esta ação" });
    }
  };
}

/** Atalho: qualquer papel da equipe da agência (exclui `client`). */
export const requireStaff = requireRole("owner", "admin", "manager", "analyst");

/** Atalho: quem pode administrar (criar clientes, convidar usuários). */
export const requireAdmin = requireRole("owner", "admin");

/** A organização do usuário. Nunca aceitar `org_id` vindo do cliente. */
export function orgIdOf(request: FastifyRequest): string | null {
  return request.ctx?.organizations[0]?.org_id ?? null;
}

/**
 * Bloqueia requisições que mudam estado sem o cabeçalho do nosso front.
 *
 * Um formulário malicioso em outro site não consegue enviar cabeçalho
 * customizado sem passar por preflight de CORS — que a nossa política
 * recusa. É defesa extra além do cookie SameSite=strict.
 */
export async function requireSameOrigin(request: FastifyRequest, reply: FastifyReply) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;

  // Webhooks vêm de servidores externos e não têm como enviar este
  // cabeçalho. Eles se autenticam pelo próprio token combinado.
  if (request.url.startsWith("/webhooks/")) return;

  if (request.headers["x-4him-app"] !== "web") {
    return reply.code(403).send({ error: "requisição não permitida" });
  }
}
