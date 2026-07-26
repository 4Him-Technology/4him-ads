import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../env.js";
import { getAuthClient, getServiceClient } from "../supabase.js";
import { requireAuth } from "../lib/auth-guard.js";
import { enviarEmail, templateRecuperarSenha, templateSenhaAlterada } from "../lib/email.js";
import {
  criarTokenDeRecuperacao,
  definirSenha,
  marcarTokenUsado,
  validarForcaDaSenha,
  validarToken,
} from "../lib/senhas.js";
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
   * POST /auth/change-password — troca a própria senha.
   *
   * Exige a senha atual: se alguém sentar no computador destravado, não
   * consegue tomar a conta trocando a senha.
   */
  app.post(
    "/auth/change-password",
    {
      preHandler: requireAuth,
      config: { rateLimit: { max: 5, timeWindow: "10 minutes" } },
    },
    async (request, reply) => {
      const schema = z.object({
        senhaAtual: z.string().min(1).max(200),
        novaSenha: z.string().min(8).max(200),
      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "dados inválidos" });

      const { senhaAtual, novaSenha } = parsed.data;

      const problema = validarForcaDaSenha(novaSenha);
      if (problema) return reply.code(400).send({ error: problema });

      // Confere a senha atual tentando autenticar de novo.
      const { data: perfil } = await request.db!.from("profiles").select("email, full_name").eq("id", request.session!.userId).single();
      if (!perfil?.email) return reply.code(400).send({ error: "perfil sem e-mail" });

      const { error: erroLogin } = await getAuthClient().auth.signInWithPassword({
        email: perfil.email,
        password: senhaAtual,
      });

      if (erroLogin) {
        request.log.warn({ userId: request.session!.userId }, "troca de senha com senha atual errada");
        return reply.code(401).send({ error: "Senha atual incorreta" });
      }

      try {
        await definirSenha(request.session!.userId, novaSenha);
      } catch (err) {
        request.log.error({ err: (err as Error).message }, "falha ao alterar senha");
        return reply.code(500).send({ error: "não foi possível alterar a senha" });
      }

      const aviso = templateSenhaAlterada(perfil.full_name ?? perfil.email);
      void enviarEmail({
        para: perfil.email,
        assunto: aviso.assunto,
        template: "senha_alterada",
        html: aviso.html,
        texto: aviso.texto,
      });

      // A sessão atual continua válida; encerrá-la só irritaria quem
      // acabou de provar que é o dono da conta.
      request.log.info({ userId: request.session!.userId }, "senha alterada");
      return { ok: true };
    },
  );

  /**
   * POST /auth/forgot-password — pede o link de redefinição.
   *
   * Responde SEMPRE 200, exista ou não o e-mail: caso contrário, o
   * endpoint viraria uma forma de descobrir quem tem conta no sistema.
   */
  app.post(
    "/auth/forgot-password",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const schema = z.object({ email: z.string().email().max(320) });
      const parsed = schema.safeParse(request.body);

      // Mesmo com corpo inválido, não damos pista.
      if (!parsed.success) return { ok: true };

      const email = parsed.data.email.toLowerCase();
      const service = getServiceClient();

      const { data: perfil } = await service
        .from("profiles")
        .select("id, email, full_name")
        .ilike("email", email)
        .maybeSingle();

      if (perfil) {
        try {
          const { token } = await criarTokenDeRecuperacao(perfil.id, request.ip);
          const url = `${env.APP_URL}/redefinir-senha?token=${token}`;
          const msg = templateRecuperarSenha(perfil.full_name ?? perfil.email ?? "", url);

          await enviarEmail({
            para: perfil.email as string,
            assunto: msg.assunto,
            template: "recuperar_senha",
            html: msg.html,
            texto: msg.texto,
            metadata: { userId: perfil.id },
          });
          request.log.info({ userId: perfil.id }, "link de recuperação enviado");
        } catch (err) {
          // Falha interna não muda a resposta — não vazamos nada.
          request.log.error({ err: (err as Error).message }, "falha ao gerar recuperação");
        }
      } else {
        request.log.info({ email, ip: request.ip }, "recuperação para e-mail inexistente");
      }

      return { ok: true };
    },
  );

  /** POST /auth/reset-password — define a nova senha usando o token do e-mail. */
  app.post(
    "/auth/reset-password",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const schema = z.object({
        token: z.string().min(20).max(200),
        novaSenha: z.string().min(8).max(200),
      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "dados inválidos" });

      const problema = validarForcaDaSenha(parsed.data.novaSenha);
      if (problema) return reply.code(400).send({ error: problema });

      const valido = await validarToken(parsed.data.token);
      if (!valido) {
        return reply.code(400).send({ error: "Link inválido ou expirado. Peça um novo." });
      }

      try {
        await definirSenha(valido.user_id, parsed.data.novaSenha);
        await marcarTokenUsado(valido.id);
      } catch (err) {
        request.log.error({ err: (err as Error).message }, "falha ao redefinir senha");
        return reply.code(500).send({ error: "não foi possível redefinir a senha" });
      }

      const service = getServiceClient();
      const { data: perfil } = await service
        .from("profiles")
        .select("email, full_name")
        .eq("id", valido.user_id)
        .single();

      if (perfil?.email) {
        const aviso = templateSenhaAlterada(perfil.full_name ?? perfil.email);
        void enviarEmail({
          para: perfil.email,
          assunto: aviso.assunto,
          template: "senha_alterada",
          html: aviso.html,
          texto: aviso.texto,
        });
      }

      // Quem redefiniu a senha pode ter sido vítima de invasão: derrubar
      // as tentativas de login acumuladas evita que fique travado agora.
      await service.rpc("register_login_attempt", {
        p_email: perfil?.email ?? "",
        p_ip: request.ip,
        p_success: true,
      });

      request.log.info({ userId: valido.user_id }, "senha redefinida por token");
      return { ok: true };
    },
  );

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
