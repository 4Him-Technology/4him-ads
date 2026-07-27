import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { orgIdOf, requireAuth, requireStaff } from "../lib/auth-guard.js";
import { getServiceClient } from "../supabase.js";
import {
  IaError,
  MODELOS,
  gerarCriativo,
  isIaConfigurada,
  montarPrompt,
  type ChaveModelo,
  type Formato,
} from "../lib/ia-criativos.js";

const BUCKET = "creatives";
const FORMATOS = ["feed_quadrado", "feed_vertical", "story", "paisagem", "outro"] as const;

const criarSchema = z.object({
  client_id: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  type: z.enum(["image", "video", "carousel", "collection", "text", "other"]).default("image"),
  format: z.enum(FORMATOS).default("outro"),
  headline: z.string().trim().max(300).optional(),
  body: z.string().trim().max(2000).optional(),
  call_to_action: z.string().trim().max(80).optional(),
  destination_url: z.string().trim().max(500).optional(),
  tags: z.array(z.string().trim().max(40)).max(20).optional(),
  /** Nome do arquivo que será enviado; usado para montar o caminho. */
  file_name: z.string().trim().max(200).optional(),
  mime_type: z.string().trim().max(100).optional(),
});

export async function creativeRoutes(app: FastifyInstance) {
  /** GET /creatives?client_id= — biblioteca do cliente. */
  app.get<{ Querystring: { client_id?: string; status?: string } }>(
    "/creatives",
    { preHandler: requireAuth },
    async (request, reply) => {
      let query = request
        .db!.from("creatives")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);

      if (request.query.client_id) query = query.eq("client_id", request.query.client_id);
      if (request.query.status) query = query.eq("status", request.query.status);

      const { data, error } = await query;
      if (error) {
        request.log.error({ err: error.message }, "falha ao listar criativos");
        return reply.code(500).send({ error: "erro ao listar criativos" });
      }

      // O arquivo fica em bucket privado: devolvemos URLs assinadas e
      // temporárias, nunca o caminho cru.
      const service = getServiceClient();
      const comUrl = await Promise.all(
        (data ?? []).map(async (c) => {
          if (!c.storage_path) return c;
          const { data: assinada } = await service.storage
            .from(BUCKET)
            .createSignedUrl(c.storage_path, 60 * 60);
          return { ...c, asset_url: assinada?.signedUrl ?? c.asset_url };
        }),
      );

      return comUrl;
    },
  );

  /**
   * POST /creatives — registra o criativo e devolve URL para enviar o arquivo.
   *
   * O envio vai direto do navegador para o armazenamento, sem passar
   * pela API: arquivo de vídeo tem dezenas de MB e não faz sentido
   * trafegar duas vezes.
   */
  app.post("/creatives", { preHandler: [requireAuth, requireStaff] }, async (request, reply) => {
    const parsed = criarSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "dados inválidos" });

    const orgId = orgIdOf(request);
    if (!orgId) return reply.code(403).send({ error: "usuário sem organização" });

    const { file_name, mime_type, client_id, ...dados } = parsed.data;

    // Confere sob RLS que quem pede enxerga este cliente.
    const { data: cliente } = await request
      .db!.from("clients")
      .select("id")
      .eq("id", client_id)
      .single();
    if (!cliente) return reply.code(404).send({ error: "cliente não encontrado" });

    const id = randomUUID();
    const extensao = file_name?.split(".").pop()?.toLowerCase().slice(0, 5);
    const storagePath = file_name ? `${client_id}/${id}${extensao ? `.${extensao}` : ""}` : null;

    const { data, error } = await request
      .db!.from("creatives")
      .insert({
        ...dados,
        id,
        client_id,
        org_id: orgId,
        source: "upload",
        status: "draft",
        storage_path: storagePath,
        mime_type: mime_type ?? null,
        created_by: request.ctx?.profile.id ?? null,
      })
      .select()
      .single();

    if (error) {
      request.log.error({ err: error.message }, "falha ao criar criativo");
      return reply.code(500).send({ error: "erro ao criar criativo" });
    }

    let uploadUrl: string | null = null;
    if (storagePath) {
      const { data: assinada, error: erroUpload } = await getServiceClient()
        .storage.from(BUCKET)
        .createSignedUploadUrl(storagePath);
      if (erroUpload) {
        request.log.error({ err: erroUpload.message }, "falha ao assinar upload");
      }
      uploadUrl = assinada?.signedUrl ?? null;
    }

    return reply.code(201).send({ criativo: data, uploadUrl });
  });

  /** PATCH /creatives/:id — edita dados ou muda a situação. */
  app.patch<{ Params: { id: string } }>(
    "/creatives/:id",
    { preHandler: [requireAuth, requireStaff] },
    async (request, reply) => {
      const schema = z.object({
        name: z.string().trim().min(1).max(160).optional(),
        headline: z.string().trim().max(300).nullable().optional(),
        body: z.string().trim().max(2000).nullable().optional(),
        call_to_action: z.string().trim().max(80).nullable().optional(),
        destination_url: z.string().trim().max(500).nullable().optional(),
        tags: z.array(z.string().trim().max(40)).max(20).optional(),
        format: z.enum(FORMATOS).optional(),
        status: z.enum(["draft", "review", "approved", "rejected", "archived"]).optional(),
      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "dados inválidos" });

      const dados: Record<string, unknown> = { ...parsed.data };

      // Aprovar registra quem e quando — vira prova documental.
      if (parsed.data.status === "approved") {
        dados.approved_at = new Date().toISOString();
        dados.approved_by = request.ctx?.profile.id ?? null;
      }

      const { data, error } = await request
        .db!.from("creatives")
        .update(dados)
        .eq("id", request.params.id)
        .select()
        .single();

      if (error || !data) return reply.code(404).send({ error: "criativo não encontrado" });
      return data;
    },
  );

  /** DELETE /creatives/:id — remove o registro e o arquivo. */
  app.delete<{ Params: { id: string } }>(
    "/creatives/:id",
    { preHandler: [requireAuth, requireStaff] },
    async (request, reply) => {
      const { data: criativo } = await request
        .db!.from("creatives")
        .select("id, storage_path")
        .eq("id", request.params.id)
        .single();

      if (!criativo) return reply.code(404).send({ error: "criativo não encontrado" });

      if (criativo.storage_path) {
        await getServiceClient().storage.from(BUCKET).remove([criativo.storage_path]);
      }
      await request.db!.from("creatives").delete().eq("id", criativo.id);

      return { ok: true };
    },
  );

  /** GET /creatives/models — modelos disponíveis e custo estimado. */
  app.get("/creatives/models", { preHandler: [requireAuth, requireStaff] }, async () => ({
    configurado: isIaConfigurada,
    modelos: Object.entries(MODELOS).map(([chave, m]) => ({
      chave,
      rotulo: m.rotulo,
      descricao: m.descricao,
      custoAprox: m.custoAprox,
    })),
  }));

  /**
   * POST /creatives/generate — gera um criativo por IA.
   *
   * O prompt é montado a partir do briefing do cliente, incluindo as
   * restrições dele como limite. Isso é o que separa uma imagem
   * genérica de uma peça que conversa com o negócio — e evita gerar
   * algo que reprova no Meta.
   */
  app.post(
    "/creatives/generate",
    {
      preHandler: [requireAuth, requireStaff],
      // Geração custa dinheiro: limite por segurança, não por performance.
      config: { rateLimit: { max: 20, timeWindow: "5 minutes" } },
    },
    async (request, reply) => {
      const schema = z.object({
        client_id: z.string().uuid(),
        pedido: z.string().trim().min(5).max(1500),
        modelo: z.enum(["imagem_rapida", "imagem_qualidade", "texto_na_imagem", "video"]),
        formato: z.enum(FORMATOS).default("feed_quadrado"),
        name: z.string().trim().max(160).optional(),
      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "dados inválidos" });

      if (!isIaConfigurada) {
        return reply.code(503).send({
          error:
            "Geração por IA não configurada. Crie uma conta em fal.ai e defina FAL_KEY no .env.",
        });
      }

      const orgId = orgIdOf(request);
      if (!orgId) return reply.code(403).send({ error: "usuário sem organização" });

      const { client_id, pedido, modelo, formato } = parsed.data;

      // Briefing do cliente vira contexto do prompt (respeita RLS).
      const { data: briefing } = await request.db!.rpc("contexto_ia", { p_client: client_id });
      if (briefing === undefined) {
        return reply.code(404).send({ error: "cliente não encontrado" });
      }

      const { prompt, promptNegativo } = montarPrompt({
        pedido,
        briefing: briefing as Parameters<typeof montarPrompt>[0]["briefing"],
      });

      const service = getServiceClient();
      const { data: geracao } = await service
        .from("creative_generations")
        .insert({
          org_id: orgId,
          client_id,
          status: "running",
          kind: modelo === "video" ? "video" : "image",
          prompt,
          negative_prompt: promptNegativo,
          format: formato,
          model: MODELOS[modelo].id,
          requested_by: request.ctx?.profile.id ?? null,
        })
        .select()
        .single();

      try {
        const resultado = await gerarCriativo({
          modelo: modelo as ChaveModelo,
          prompt,
          promptNegativo,
          formato: formato as Formato,
        });

        // A URL do provedor expira: baixamos e guardamos no nosso bucket.
        const arquivo = await fetch(resultado.url);
        if (!arquivo.ok) throw new IaError("não foi possível baixar o arquivo gerado");
        const bytes = Buffer.from(await arquivo.arrayBuffer());

        const id = randomUUID();
        const ext = modelo === "video" ? "mp4" : "png";
        const caminho = `${client_id}/${id}.${ext}`;

        const { error: erroUpload } = await service.storage
          .from(BUCKET)
          .upload(caminho, bytes, {
            contentType: modelo === "video" ? "video/mp4" : "image/png",
            upsert: false,
          });
        if (erroUpload) throw new IaError(`falha ao guardar o arquivo: ${erroUpload.message}`);

        const { data: criativo, error: erroCriativo } = await service
          .from("creatives")
          .insert({
            id,
            org_id: orgId,
            client_id,
            name: parsed.data.name ?? pedido.slice(0, 80),
            type: modelo === "video" ? "video" : "image",
            source: "ai",
            status: "draft",
            format: formato,
            storage_path: caminho,
            width: resultado.largura ?? null,
            height: resultado.altura ?? null,
            file_size: bytes.length,
            mime_type: modelo === "video" ? "video/mp4" : "image/png",
            metadata: { prompt, modelo: resultado.modelo },
            created_by: request.ctx?.profile.id ?? null,
          })
          .select()
          .single();

        if (erroCriativo) throw new IaError(erroCriativo.message);

        await service
          .from("creative_generations")
          .update({
            status: "done",
            creative_id: criativo.id,
            cost_usd: resultado.custoAprox,
            finished_at: new Date().toISOString(),
          })
          .eq("id", geracao!.id);

        const { data: assinada } = await service.storage
          .from(BUCKET)
          .createSignedUrl(caminho, 60 * 60);

        request.log.info(
          { clientId: client_id, modelo: resultado.modelo, por: request.ctx?.profile.id },
          "criativo gerado por IA",
        );

        return reply.code(201).send({
          criativo: { ...criativo, asset_url: assinada?.signedUrl ?? null },
          custoAprox: resultado.custoAprox,
        });
      } catch (err) {
        const mensagem = err instanceof IaError ? err.message : "falha na geração";
        await service
          .from("creative_generations")
          .update({ status: "failed", error: mensagem, finished_at: new Date().toISOString() })
          .eq("id", geracao!.id);

        request.log.error({ err: (err as Error).message }, "falha ao gerar criativo");
        return reply.code(502).send({ error: mensagem });
      }
    },
  );

  /** GET /creatives/summary?client_id= — contagens e custo de IA. */
  app.get<{ Querystring: { client_id?: string } }>(
    "/creatives/summary",
    { preHandler: requireAuth },
    async (request, reply) => {
      if (!request.query.client_id) {
        return reply.code(400).send({ error: "informe client_id" });
      }
      const { data, error } = await request.db!.rpc("resumo_criativos", {
        p_client: request.query.client_id,
      });
      if (error) return reply.code(500).send({ error: "erro ao carregar resumo" });
      return data;
    },
  );
}
