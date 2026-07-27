-- ============================================================
-- 0015_criativos.sql — Biblioteca de criativos e geração por IA
--
-- A 4Him produz os criativos, então este módulo não depende de nenhuma
-- integração com plataforma de anúncios. Guarda o arquivo, o histórico
-- de versões, o fluxo de aprovação e — quando gerado por IA — o prompt
-- e o modelo que o produziram.
-- ============================================================

create type creative_status as enum (
  'draft',      -- em produção pela equipe
  'review',     -- aguardando aprovação do cliente
  'approved',   -- liberado para veicular
  'rejected',   -- cliente pediu mudança
  'archived'
);

create type creative_source as enum ('upload', 'ai', 'external');

create type creative_format as enum (
  'feed_quadrado',    -- 1:1
  'feed_vertical',    -- 4:5
  'story',            -- 9:16
  'paisagem',         -- 16:9
  'outro'
);

alter table creatives
  add column status        creative_status not null default 'draft',
  add column source        creative_source not null default 'upload',
  add column format        creative_format not null default 'outro',
  -- Caminho no bucket. O arquivo nunca é público: servimos por URL assinada.
  add column storage_path  text,
  add column width         integer,
  add column height        integer,
  add column file_size     integer,
  add column mime_type     text,
  add column duration_seconds numeric(8,2),
  -- Versionamento: uma nova versão aponta para a original.
  add column parent_id     uuid references creatives(id) on delete set null,
  add column version       integer not null default 1,
  add column approved_at   timestamptz,
  add column approved_by   uuid references profiles(id);

create index idx_creatives_status on creatives (client_id, status);
create index idx_creatives_parent on creatives (parent_id);

comment on column creatives.storage_path is
  'Caminho no bucket privado. O acesso é sempre por URL assinada e temporária.';
comment on column creatives.parent_id is
  'Versão anterior. Permite comparar e voltar atrás sem perder histórico.';

-- ------------------------------------------------------------
-- Gerações por IA.
--
-- Guardar prompt, modelo e custo é o que permite: repetir o que deu
-- certo, entender por que uma peça ficou ruim, e saber quanto se gastou
-- por cliente. Sem isso, a geração vira caixa-preta.
-- ------------------------------------------------------------
create type generation_status as enum ('queued', 'running', 'done', 'failed');

create table creative_generations (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  client_id    uuid not null references clients(id) on delete cascade,
  creative_id  uuid references creatives(id) on delete set null,
  status       generation_status not null default 'queued',
  kind         text not null default 'image',   -- image | video
  prompt       text not null,
  negative_prompt text,
  format       creative_format not null default 'feed_quadrado',
  provider     text not null default 'fal',
  model        text not null,
  -- Custo em dólar informado pelo provedor; some por cliente para saber
  -- quanto a produção por IA está custando.
  cost_usd     numeric(10,4),
  external_id  text,
  result_url   text,
  error        text,
  requested_by uuid references profiles(id),
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);
create index idx_gen_client on creative_generations (client_id, created_at desc);

alter table creative_generations enable row level security;

-- Só a equipe gera e enxerga o histórico de geração. O cliente vê o
-- criativo final, não o prompt nem quantas tentativas foram feitas.
create policy gen_staff_all on creative_generations
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));

comment on table creative_generations is
  'Histórico de geração por IA: prompt, modelo e custo. Visível apenas à equipe.';

-- ============================================================
-- Armazenamento dos arquivos (Supabase Storage)
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'creatives',
  'creatives',
  false,  -- privado: acesso só por URL assinada
  104857600,  -- 100 MB
  array[
    'image/png','image/jpeg','image/webp','image/gif',
    'video/mp4','video/quicktime','video/webm'
  ]
)
on conflict (id) do nothing;

-- O caminho é sempre `<client_id>/<arquivo>`, então a primeira pasta
-- identifica o cliente e o RLS reaproveita a mesma regra do resto do
-- sistema: staff da agência ou quem tem acesso àquele cliente.
create policy "criativos: leitura de quem tem acesso ao cliente"
  on storage.objects for select
  using (
    bucket_id = 'creatives'
    and has_client_access(((storage.foldername(name))[1])::uuid)
  );

create policy "criativos: envio pela equipe"
  on storage.objects for insert
  with check (
    bucket_id = 'creatives'
    and exists (
      select 1 from clients c
      where c.id = ((storage.foldername(name))[1])::uuid
        and is_org_member(c.org_id)
    )
  );

create policy "criativos: remoção pela equipe"
  on storage.objects for delete
  using (
    bucket_id = 'creatives'
    and exists (
      select 1 from clients c
      where c.id = ((storage.foldername(name))[1])::uuid
        and is_org_member(c.org_id)
    )
  );

-- ------------------------------------------------------------
-- Resumo de criativos de um cliente, para a tela do módulo.
-- ------------------------------------------------------------
create or replace function resumo_criativos(p_client uuid)
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'total',     count(*),
    'rascunho',  count(*) filter (where status = 'draft'),
    'revisao',   count(*) filter (where status = 'review'),
    'aprovados', count(*) filter (where status = 'approved'),
    'por_ia',    count(*) filter (where source = 'ai'),
    'custo_ia_usd', coalesce((
      select sum(cost_usd) from creative_generations g
      where g.client_id = p_client and g.status = 'done'
    ), 0)
  )
  from creatives where client_id = p_client;
$$;
