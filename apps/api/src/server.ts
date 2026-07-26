import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { env } from "./env.js";
import { requireSameOrigin } from "./lib/auth-guard.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { clientRoutes } from "./routes/clients.js";
import { userRoutes } from "./routes/users.js";
import { billingRoutes } from "./routes/billing.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { webhookRoutes } from "./routes/webhooks.js";

/** Build do site, quando empacotado junto (deploy de serviço único). */
const WEB_DIST = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../web/dist",
);

export function buildServer() {
  const servirSite = env.NODE_ENV === "production" && existsSync(WEB_DIST);

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
    // Servindo o site, a política precisa permitir os próprios arquivos.
    // Servindo só JSON, fechamos tudo.
    contentSecurityPolicy: servirSite
      ? {
          directives: {
            "default-src": ["'self'"],
            "img-src": ["'self'", "data:"],
            "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            "font-src": ["'self'", "https://fonts.gstatic.com"],
            "connect-src": ["'self'"],
            "frame-ancestors": ["'none'"],
          },
        }
      : { directives: { "default-src": ["'none'"], "frame-ancestors": ["'none'"] } },
    crossOriginResourcePolicy: { policy: "same-origin" },
    referrerPolicy: { policy: "no-referrer" },
  });

  // --- CORS restrito ao nosso front ---
  // Servindo site e API no mesmo domínio, não há requisição entre origens;
  // a política fica como defesa extra caso o front seja separado depois.
  app.register(cors, {
    origin: env.WEB_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["content-type", "x-4him-app"],
  });

  // --- Cookies assinados ---
  app.register(cookie, { secret: env.SESSION_SECRET });

  // --- Limite global (o login tem limite próprio, mais duro) ---
  app.register(rateLimit, { global: true, max: 300, timeWindow: "1 minute" });

  // --- Anti-CSRF em tudo que altera estado ---
  app.addHook("preHandler", requireSameOrigin);

  // --- Rotas da API, todas sob /api ---
  // O mesmo caminho vale em desenvolvimento (proxy do Vite) e em produção,
  // então não há surpresa no deploy.
  app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(authRoutes);
      await api.register(clientRoutes);
      await api.register(userRoutes);
      await api.register(billingRoutes);
      await api.register(dashboardRoutes);
      await api.register(webhookRoutes);
    },
    { prefix: "/api" },
  );

  // --- Site (deploy de serviço único) ---
  if (servirSite) {
    app.register(fastifyStatic, { root: WEB_DIST, wildcard: false });

    // SPA: qualquer rota desconhecida devolve o index, para o React Router
    // resolver. Requisições a /api que chegam aqui são 404 de verdade.
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) {
        return reply.code(404).send({ error: "rota não encontrada" });
      }
      return reply.sendFile("index.html");
    });
  }

  // Erro genérico: não vaza stack trace nem detalhe interno.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error({ err: error }, "erro não tratado");
    const status = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    reply.code(status).send({ error: status === 500 ? "erro interno" : error.message });
  });

  return app;
}
