-- ============================================================
-- 0012_briefing_ia.sql — Briefing do cliente (insumo da IA)
--
-- Decisão (2026-07-26): a IA só sugere palavra-chave e criativo bons se
-- souber o que a empresa faz, para quem vende e o que a diferencia.
-- Esses campos são preenchidos no cadastro e viram o CONTEXTO enviado
-- ao modelo — sem eles, qualquer sugestão é genérica.
--
-- É também o briefing que a agência já produzia no papel; aqui ele fica
-- estruturado, versionado e reaproveitável.
-- ============================================================

alter table clients
  add column business_description text,   -- o que a empresa faz, em texto livre
  add column target_audience      text,   -- quem compra
  add column value_proposition    text,   -- por que compram dela e não do concorrente
  add column main_products        text,   -- principais produtos ou serviços
  add column service_area         text,   -- região atendida (bairro, cidade, país)
  add column avg_ticket           numeric(12,2) check (avg_ticket >= 0),
  add column campaign_goal        text,   -- vendas, leads, agendamento, visita à loja
  add column competitors          text[], -- concorrentes conhecidos
  add column seed_keywords        text[], -- termos que o cliente já usa
  add column restrictions         text,   -- o que NÃO pode ser dito ou usado
  add column website              text,
  add column social_links         jsonb not null default '{}'::jsonb;

comment on column clients.business_description is
  'Descrição do negócio. Contexto principal enviado à IA para sugerir palavras-chave, públicos e ângulos de criativo.';
comment on column clients.restrictions is
  'Restrições do cliente (termos proibidos, promessas que não pode fazer). Vai no prompt como limite — evita sugestão que reprova no Meta ou gera problema jurídico.';
comment on column clients.seed_keywords is
  'Termos que o cliente já usa. Servem de semente para a expansão de palavras-chave.';

-- ------------------------------------------------------------
-- Sugestões geradas por IA.
--
-- Guardadas com o modelo e a versão do prompt que as produziu: sem isso
-- não há como saber por que uma sugestão antiga ficou ruim, nem comparar
-- versões. Nada é aplicado sem aprovação humana.
-- ------------------------------------------------------------
create type insight_kind as enum (
  'keywords',        -- palavras-chave sugeridas
  'audience',        -- públicos / segmentações
  'creative_angle',  -- ângulos de criativo e ganchos
  'competitor',      -- leitura de concorrência
  'diagnosis'        -- diagnóstico de desempenho
);

create type insight_status as enum ('draft', 'approved', 'rejected', 'applied');

create table ai_insights (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  client_id    uuid not null references clients(id) on delete cascade,
  kind         insight_kind not null,
  status       insight_status not null default 'draft',
  title        text,
  content      jsonb not null default '{}'::jsonb,
  -- Rastreabilidade: qual modelo, qual prompt, quanto custou.
  model        text,
  prompt_version text,
  input_tokens  integer,
  output_tokens integer,
  generated_at timestamptz not null default now(),
  reviewed_by  uuid references profiles(id),
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index idx_insights_client on ai_insights (client_id, kind, generated_at desc);

alter table ai_insights enable row level security;

-- A equipe gerencia. O cliente vê apenas o que foi aprovado — sugestão
-- crua da IA não deve chegar a ele sem revisão humana.
create policy insights_staff_all on ai_insights
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));
create policy insights_client_read on ai_insights
  for select using (has_client_access(client_id) and status in ('approved', 'applied'));

comment on table ai_insights is
  'Sugestões geradas por IA, com o modelo e a versão do prompt que as produziu. Nada é aplicado sem aprovação humana.';

-- ------------------------------------------------------------
-- Monta o contexto do cliente para enviar ao modelo.
-- Centralizar aqui garante que todo prompt receba a mesma base — e que
-- dado sensível de cobrança nunca vá junto por descuido.
-- ------------------------------------------------------------
create or replace function contexto_ia(p_client uuid)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'nome',            c.name,
    'segmento',        c.segment,
    'descricao',       c.business_description,
    'publico_alvo',    c.target_audience,
    'proposta_valor',  c.value_proposition,
    'produtos',        c.main_products,
    'regiao',          c.service_area,
    'ticket_medio',    c.avg_ticket,
    'objetivo',        c.campaign_goal,
    'concorrentes',    to_jsonb(c.competitors),
    'palavras_semente', to_jsonb(c.seed_keywords),
    'restricoes',      c.restrictions,
    'site',            c.website
  ))
  from clients c
  where c.id = p_client;
$$;

comment on function contexto_ia is
  'Briefing do cliente em JSON, pronto para o prompt. Não inclui dados de cobrança.';
