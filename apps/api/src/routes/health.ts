import type { FastifyInstance } from "fastify";
import { isSupabaseConfigured } from "../env.js";
import { requireAuth, requireStaff } from "../lib/auth-guard.js";

export async function healthRoutes(app: FastifyInstance) {
  /**
   * GET /health — verificação pública de disponibilidade.
   *
   * Devolve o MÍNIMO possível de propósito: nada de nome de serviço,
   * versão ou tecnologia usada. Detalhar aqui só ajudaria quem procura
   * vulnerabilidades conhecidas de cada componente.
   */
  app.get("/health", async () => ({ status: "ok" }));

  /** GET /diagnostics — detalhes internos, só para a equipe autenticada. */
  app.get("/diagnostics", { preHandler: [requireAuth, requireStaff] }, async () => ({
    status: "ok",
    database: isSupabaseConfigured ? "conectado" : "não configurado",
    uptimeSeconds: Math.round(process.uptime()),
    time: new Date().toISOString(),
  }));
}
