import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { env } from "./env.js";
import { requireSameOrigin } from "./lib/auth-guard.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { clientRoutes } from "./routes/clients.js";
import { userRoutes } from "./routes/users.js";
import { billingRoutes } from "./routes/billing.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { webhookRoutes } from "./routes/webhooks.js";

export function buildServer() {
  const app = Fastify({
    // Confia no proxy só em produção (para pegar o IP real no rate limit).
    trustProxy: env.NODE_ENV === "production",
    logger: {
      transport: env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
      // Nunca registrar segredos no log, mesmo em caso de erro.
      redact: {
        paths: [
          "req.headers.cookie",
          "req.headers.authorization",
          "res.headers['set-cookie']",
          "*.password",
          "*.accessToken",
          "*.refreshToken",
        ],
        censor: "[redigido]",
      },
    },
  });

  // --- Cabeçalhos de segurança ---
  app.register(helmet, {
    // A API só devolve JSON; nada deve ser embutido em página de terceiros.
    contentSecurityPolicy: { directives: { "default-src": ["'none'"], "frame-ancestors": ["'none'"] } },
    crossOriginResourcePolicy: { policy: "same-origin" },
    referrerPolicy: { policy: "no-referrer" },
  });

  // --- CORS restrito: só o nosso front, e com credenciais ---
  app.register(cors, {
    origin: env.WEB_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["content-type", "x-4him-app"],
  });

  // --- Cookies assinados ---
  app.register(cookie, {
    secret: env.SESSION_SECRET,
  });

  // --- Limite global de requisições (o login tem limite próprio, mais duro) ---
  app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
  });

  // --- Anti-CSRF em tudo que altera estado ---
  app.addHook("preHandler", requireSameOrigin);

  // --- Rotas ---
  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(clientRoutes);
  app.register(userRoutes);
  app.register(billingRoutes);
  app.register(dashboardRoutes);
  app.register(webhookRoutes);
  // TODO(próxima fase): metaRoutes...

  // Erro genérico: não vaza stack trace nem detalhe interno.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error({ err: error }, "erro não tratado");
    const status = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    reply.code(status).send({ error: status === 500 ? "erro interno" : error.message });
  });

  return app;
}
