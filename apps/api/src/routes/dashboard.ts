import type { FastifyInstance } from "fastify";
import { requireAuth, requireStaff } from "../lib/auth-guard.js";
import { periodo } from "./clients.js";

export async function dashboardRoutes(app: FastifyInstance) {
  /**
   * GET /dashboard/overview — panorama da agência no período.
   *
   * Só para a equipe: reúne números de todos os clientes e a receita da
   * própria 4Him. A função no banco é SECURITY INVOKER, então mesmo que
   * esta rota fosse exposta por engano, o RLS zeraria o resultado para
   * quem não é da organização.
   */
  app.get<{ Querystring: { inicio?: string; fim?: string } }>(
    "/dashboard/overview",
    { preHandler: [requireAuth, requireStaff] },
    async (request, reply) => {
      const { inicio, fim } = periodo(request.query);

      const { data, error } = await request.db!.rpc("resumo_gerencial", {
        p_inicio: inicio,
        p_fim: fim,
      });

      if (error) {
        request.log.error({ err: error.message }, "falha no resumo gerencial");
        return reply.code(500).send({ error: "erro ao carregar o panorama" });
      }
      return data;
    },
  );
}
