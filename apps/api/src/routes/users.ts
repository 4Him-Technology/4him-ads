import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { orgIdOf, requireAdmin, requireAuth, requireStaff } from "../lib/auth-guard.js";
import { getServiceClient } from "../supabase.js";
import { criarOuObterUsuario, gerarSenhaTemporaria } from "../lib/supabase-admin.js";

const convidarEquipeSchema = z.object({
  email: z.string().trim().email().max(320),
  nome: z.string().trim().min(2).max(120),
  role: z.enum(["admin", "manager", "analyst"]),
});

const convidarClienteSchema = z.object({
  email: z.string().trim().email().max(320),
  nome: z.string().trim().min(2).max(120),
  can_edit: z.boolean().default(false),
});

export async function userRoutes(app: FastifyInstance) {
  /** GET /users — equipe da organização. */
  app.get("/users", { preHandler: [requireAuth, requireStaff] }, async (request, reply) => {
    const { data, error } = await request
      .db!.from("memberships")
      .select("id, role, created_at, profiles(id, email, full_name, is_agency_staff)")
      .order("created_at");

    if (error) {
      request.log.error({ err: error.message }, "falha ao listar usuários");
      return reply.code(500).send({ error: "erro ao listar usuários" });
    }
    return data;
  });

  /**
   * POST /users/invite — adiciona alguém à equipe da agência.
   *
   * Só owner/admin. A senha temporária aparece UMA vez na resposta:
   * quem convidou repassa à pessoa. (Envio por e-mail entra quando
   * houver serviço de e-mail configurado.)
   */
  app.post("/users/invite", { preHandler: [requireAuth, requireAdmin] }, async (request, reply) => {
    const parsed = convidarEquipeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "dados inválidos" });
    }

    const orgId = orgIdOf(request);
    if (!orgId) return reply.code(403).send({ error: "usuário sem organização" });

    const { email, nome, role } = parsed.data;
    const senha = gerarSenhaTemporaria();

    try {
      const usuario = await criarOuObterUsuario({ email, senha, nome });
      const service = getServiceClient();

      await service
        .from("profiles")
        .upsert({ id: usuario.id, email, full_name: nome, is_agency_staff: true });

      const { error } = await service
        .from("memberships")
        .upsert({ org_id: orgId, user_id: usuario.id, role }, { onConflict: "org_id,user_id" });

      if (error) throw new Error(error.message);

      request.log.info(
        { convidado: usuario.id, role, por: request.ctx?.profile.id },
        "membro da equipe convidado",
      );

      return reply.code(201).send({
        email,
        nome,
        role,
        // Só faz sentido devolver senha para quem acabou de ser criado.
        senhaTemporaria: usuario.jaExistia ? null : senha,
        jaExistia: usuario.jaExistia,
      });
    } catch (err) {
      request.log.error({ err: (err as Error).message }, "falha ao convidar equipe");
      return reply.code(500).send({ error: "não foi possível criar o convite" });
    }
  });

  /**
   * POST /clients/:id/invite — dá a alguém acesso a UM cliente (portal).
   *
   * O usuário criado aqui NÃO entra em `memberships`: ele não é da equipe.
   * Portanto `is_org_member` é falso para ele e o RLS só libera os dados
   * dos clientes em que ele tiver `client_access`.
   */
  app.post<{ Params: { id: string } }>(
    "/clients/:id/invite",
    { preHandler: [requireAuth, requireAdmin] },
    async (request, reply) => {
      const parsed = convidarClienteSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "dados inválidos" });
      }

      // Confirma, sob RLS, que quem convida enxerga este cliente.
      const { data: cliente } = await request
        .db!.from("clients")
        .select("id, name")
        .eq("id", request.params.id)
        .single();

      if (!cliente) {
        return reply.code(404).send({ error: "cliente não encontrado" });
      }

      const { email, nome, can_edit } = parsed.data;
      const senha = gerarSenhaTemporaria();

      try {
        const usuario = await criarOuObterUsuario({ email, senha, nome });
        const service = getServiceClient();

        await service
          .from("profiles")
          .upsert({ id: usuario.id, email, full_name: nome, is_agency_staff: false });

        const { error } = await service
          .from("client_access")
          .upsert(
            { client_id: cliente.id, user_id: usuario.id, can_edit },
            { onConflict: "client_id,user_id" },
          );

        if (error) throw new Error(error.message);

        request.log.info(
          { convidado: usuario.id, clientId: cliente.id, por: request.ctx?.profile.id },
          "acesso de cliente concedido",
        );

        return reply.code(201).send({
          email,
          nome,
          cliente: cliente.name,
          senhaTemporaria: usuario.jaExistia ? null : senha,
          jaExistia: usuario.jaExistia,
        });
      } catch (err) {
        request.log.error({ err: (err as Error).message }, "falha ao convidar cliente");
        return reply.code(500).send({ error: "não foi possível criar o convite" });
      }
    },
  );
}
