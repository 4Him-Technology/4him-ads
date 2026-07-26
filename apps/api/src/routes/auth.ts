import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getAuthClient, getServiceClient } from "../supabase.js";
import { requireAuth } from "../lib/auth-guard.js";
import {
  SESSION_COOKIE,
  sealSession,
  sessionCookieOptions,
  openSession,
} from "../lib/session.js";

const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(200),
});

/** Mensagem única para qualquer falha — evita descobrir quais e-mails existem. */
const GENERIC_LOGIN_ERROR = { error: "E-mail ou senha inválidos" };

interface BlockStatus {
  blocked: boolean;
  retry_after_seconds: number;
  reason: string | null;
}

export async function authRoutes(app: FastifyInstance) {
  /**
   * POST /auth/login
   *
   * Três camadas contra força bruta:
   *  1. rate limit por IP em memória (rápido, barra rajadas)
   *  2. bloqueio por CONTA no banco (segura ataque distribuído de vários IPs)
   *  3. bloqueio por IP no banco (segura varredura de vários e-mails)
   * As camadas 2 e 3 sobrevivem a reinício da API.
   */
  app.post(
    "/auth/login",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(GENERIC_LOGIN_ERROR);
      }

      const { email, password } = parsed.data;
      const ip = request.ip;
      const service = getServiceClient();

      // --- 1. Já está bloqueado? ---
      const { data: statusRows } = await service.rpc("login_block_status", {
        p_email: email,
        p_ip: ip,
      });
      const status = (Array.isArray(statusRows) ? statusRows[0] : statusRows) as
        | BlockStatus
        | undefined;

      if (status?.blocked) {
        const segundos = status.retry_after_seconds ?? 900;
        request.log.warn({ email, ip, reason: status.reason }, "login bloqueado");
        return reply
          .code(429)
          .header("retry-after", String(segundos))
          .send({
            error: "Muitas tentativas. Tente novamente mais tarde.",
            retryAfterSeconds: segundos,
          });
      }

      // --- 2. Tentativa de fato ---
      const { data, error } = await getAuthClient().auth.signInWithPassword({
        email,
        password,
      });

      const sucesso = Boolean(!error && data.session);

      // --- 3. Registra a tentativa (sempre) ---
      await service.rpc("register_login_attempt", {
        p_email: email,
        p_ip: ip,
        p_success: sucesso,
      });

      if (!sucesso || !data.session) {
        request.log.warn({ email, ip }, "login recusado");
        return reply.code(401).send(GENERIC_LOGIN_ERROR);
      }

      const session = {
        userId: data.session.user.id,
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      };

      reply.setCookie(SESSION_COOKIE, sealSession(session), sessionCookieOptions());
      request.log.info({ userId: session.userId }, "login efetuado");

      return { ok: true };
    },
  );

  /** POST /auth/logout — encerra a sessão dos dois lados. */
  app.post("/auth/logout", async (request, reply) => {
    const session = openSession(request.cookies[SESSION_COOKIE]);

    if (session) {
      try {
        await getAuthClient().auth.admin?.signOut?.(session.accessToken);
      } catch {
        /* o cookie some de qualquer forma */
      }
    }

    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  /**
   * GET /auth/me — quem está logado, papéis e clientes acessíveis.
   * Dados vindos de `current_user_context()`, que roda sob RLS.
   */
  app.get("/auth/me", { preHandler: requireAuth }, async (request, reply) => {
    const { data, error } = await request.db!.rpc("current_user_context");

    if (error) {
      request.log.error({ err: error.message }, "falha ao carregar contexto do usuário");
      return reply.code(500).send({ error: "erro ao carregar usuário" });
    }
    if (!data) {
      reply.clearCookie(SESSION_COOKIE, { path: "/" });
      return reply.code(401).send({ error: "não autenticado" });
    }

    return data;
  });
}
