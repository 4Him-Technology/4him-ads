import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  orgIdOf,
  requireAuth,
  requireAdmin,
  requireRole,
  requireStaff,
} from "../lib/auth-guard.js";

const criarClienteSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "use apenas minúsculas, números e hífens"),
  currency: z.string().length(3).default("BRL"),
  timezone: z.string().max(60).default("America/Sao_Paulo"),
  brand_color: z.string().max(20).optional(),
});

const atualizarClienteSchema = criarClienteSchema
  .partial()
  .omit({ slug: true })
  .extend({ status: z.enum(["active", "paused", "archived"]).optional() });

export async function clientRoutes(app: FastifyInstance) {
  /**
   * GET /clients — clientes visíveis para quem chamou.
   * O RLS já filtra: staff vê os da organização, usuário-cliente vê só os seus.
   */
  app.get("/clients", { preHandler: requireAuth }, async (request, reply) => {
    const { data, error } = await request
      .db!.from("clients")
      .select("id, name, slug, status, currency, timezone, brand_color, created_at")
      .order("name");

    if (error) {
      request.log.error({ err: error.message }, "falha ao listar clientes");
      return reply.code(500).send({ error: "erro ao listar clientes" });
    }
    return data;
  });

  /**
   * POST /clients — cria cliente.
   *
   * O `org_id` vem SEMPRE da sessão, nunca do corpo da requisição —
   * assim ninguém cria cliente dentro da organização de outra agência.
   */
  app.post(
    "/clients",
    { preHandler: [requireAuth, requireRole("owner", "admin", "manager")] },
    async (request, reply) => {
      const parsed = criarClienteSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "dados inválidos",
          detalhes: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        });
      }

      const orgId = orgIdOf(request);
      if (!orgId) return reply.code(403).send({ error: "usuário sem organização" });

      const { data, error } = await request
        .db!.from("clients")
        .insert({ ...parsed.data, org_id: orgId })
        .select("id, name, slug, status, currency, timezone")
        .single();

      if (error) {
        if (error.code === "23505") {
          return reply.code(409).send({ error: "já existe um cliente com esse identificador" });
        }
        request.log.error({ err: error.message }, "falha ao criar cliente");
        return reply.code(500).send({ error: "erro ao criar cliente" });
      }

      request.log.info({ clientId: data.id, por: request.ctx?.profile.id }, "cliente criado");
      return reply.code(201).send(data);
    },
  );

  /** PATCH /clients/:id — atualiza dados do cliente. */
  app.patch<{ Params: { id: string } }>(
    "/clients/:id",
    { preHandler: [requireAuth, requireRole("owner", "admin", "manager")] },
    async (request, reply) => {
      const parsed = atualizarClienteSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "dados inválidos" });
      }

      const { data, error } = await request
        .db!.from("clients")
        .update(parsed.data)
        .eq("id", request.params.id)
        .select("id, name, slug, status, currency, timezone")
        .single();

      // Sem linha retornada = o RLS barrou ou o id não existe. Mesma resposta
      // nos dois casos, para não revelar a existência de clientes de terceiros.
      if (error || !data) {
        return reply.code(404).send({ error: "cliente não encontrado" });
      }
      return data;
    },
  );

  /** GET /clients/:id/access — quem tem acesso a este cliente. */
  app.get<{ Params: { id: string } }>(
    "/clients/:id/access",
    { preHandler: [requireAuth, requireStaff] },
    async (request, reply) => {
      const { data, error } = await request
        .db!.from("client_access")
        .select("id, can_edit, created_at, profiles(id, email, full_name)")
        .eq("client_id", request.params.id);

      if (error) {
        request.log.error({ err: error.message }, "falha ao listar acessos");
        return reply.code(500).send({ error: "erro ao listar acessos" });
      }
      return data;
    },
  );

  /** DELETE /clients/:id/access/:accessId — revoga o acesso de um usuário. */
  app.delete<{ Params: { id: string; accessId: string } }>(
    "/clients/:id/access/:accessId",
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const { error } = await request
        .db!.from("client_access")
        .delete()
        .eq("id", request.params.accessId)
        .eq("client_id", request.params.id);

      if (error) {
        return reply.code(500).send({ error: "erro ao revogar acesso" });
      }
      request.log.info(
        { accessId: request.params.accessId, por: request.ctx?.profile.id },
        "acesso revogado",
      );
      return { ok: true };
    },
  );
}
