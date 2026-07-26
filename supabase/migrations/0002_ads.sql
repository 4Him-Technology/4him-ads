-- ============================================================
-- 0002_ads.sql — Conectores, contas, hierarquia de campanhas, criativos, métricas
-- ============================================================

-- ---------- Enums ----------
create type ad_platform       as enum ('meta', 'google', 'tiktok', 'linkedin', 'pinterest', 'other');
create type connection_status as enum ('active', 'expired', 'revoked', 'error');
create type entity_status     as enum ('active', 'paused', 'archived', 'deleted', 'pending', 'draft');
create type creative_type     as enum ('image', 'video', 'carousel', 'collection', 'text', 'other');
create type metric_level      as enum ('account', 'campaign', 'adset', 'ad');

-- ---------- platform_connections (OAuth por plataforma) ----------
-- Tokens NUNCA vão ao front. Em produção, referenciar segredo no Supabase Vault.
create table platform_connections (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations(id) on delete cascade,
  client_id           uuid references clients(id) on delete cascade,
  platform            ad_platform not null,
  external_account_id text,
  display_name        text,
  status              connection_status not null default 'active',
  scopes              text[],
  access_token        text,
  refresh_token       text,
  token_expires_at    timestamptz,
  metadata            jsonb not null default '{}'::jsonb,
  last_synced_at      timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index idx_conn_org    on platform_connections (org_id);
create index idx_conn_client on platform_connections (client_id);
create trigger trg_conn_updated before update on platform_connections
  for each row execute function set_updated_at();

-- ---------- ad_accounts ----------
create table ad_accounts (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  client_id     uuid not null references clients(id) on delete cascade,
  connection_id uuid references platform_connections(id) on delete set null,
  platform      ad_platform not null,
  external_id   text not null,
  name          text,
  currency      text,
  timezone      text,
  status        entity_status not null default 'active',
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (platform, external_id)
);
create index idx_adacct_client on ad_accounts (client_id);
create trigger trg_adacct_updated before update on ad_accounts
  for each row execute function set_updated_at();

-- ---------- campaigns ----------
create table campaigns (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  client_id       uuid not null references clients(id) on delete cascade,
  ad_account_id   uuid not null references ad_accounts(id) on delete cascade,
  platform        ad_platform not null,
  external_id     text,
  name            text not null,
  objective       text,
  status          entity_status not null default 'draft',
  daily_budget    numeric(14,2),
  lifetime_budget numeric(14,2),
  start_time      timestamptz,
  stop_time       timestamptz,
  raw             jsonb not null default '{}'::jsonb,
  synced_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (platform, external_id)
);
create index idx_campaigns_client on campaigns (client_id);
create index idx_campaigns_acct   on campaigns (ad_account_id);
create trigger trg_campaign_updated before update on campaigns
  for each row execute function set_updated_at();

-- ---------- ad_sets (ad sets / ad groups) ----------
create table ad_sets (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  client_id       uuid not null references clients(id) on delete cascade,
  campaign_id     uuid not null references campaigns(id) on delete cascade,
  platform        ad_platform not null,
  external_id     text,
  name            text not null,
  status          entity_status not null default 'draft',
  daily_budget    numeric(14,2),
  lifetime_budget numeric(14,2),
  targeting       jsonb not null default '{}'::jsonb,
  raw             jsonb not null default '{}'::jsonb,
  synced_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (platform, external_id)
);
create index idx_adsets_campaign on ad_sets (campaign_id);
create trigger trg_adset_updated before update on ad_sets
  for each row execute function set_updated_at();

-- ---------- creatives (biblioteca de criativos) ----------
create table creatives (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  client_id       uuid not null references clients(id) on delete cascade,
  name            text not null,
  type            creative_type not null default 'image',
  external_id     text,
  asset_url       text,
  thumbnail_url   text,
  headline        text,
  body            text,
  call_to_action  text,
  destination_url text,
  tags            text[],
  metadata        jsonb not null default '{}'::jsonb,
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_creatives_client on creatives (client_id);
create trigger trg_creative_updated before update on creatives
  for each row execute function set_updated_at();

-- ---------- ads (ligam ad_set + creative) ----------
create table ads (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  client_id   uuid not null references clients(id) on delete cascade,
  ad_set_id   uuid not null references ad_sets(id) on delete cascade,
  creative_id uuid references creatives(id) on delete set null,
  platform    ad_platform not null,
  external_id text,
  name        text not null,
  status      entity_status not null default 'draft',
  raw         jsonb not null default '{}'::jsonb,
  synced_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (platform, external_id)
);
create index idx_ads_adset    on ads (ad_set_id);
create index idx_ads_creative on ads (creative_id);
create trigger trg_ad_updated before update on ads
  for each row execute function set_updated_at();

-- ---------- metrics_daily (série temporal por entidade) ----------
create table metrics_daily (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  client_id   uuid not null references clients(id) on delete cascade,
  platform    ad_platform not null,
  level       metric_level not null,
  entity_id   uuid not null,             -- id interno da entidade (account/campaign/adset/ad)
  date        date not null,
  impressions bigint  not null default 0,
  clicks      bigint  not null default 0,
  spend       numeric(14,2) not null default 0,
  conversions numeric(14,2) not null default 0,
  revenue     numeric(14,2) not null default 0,
  ctr         numeric(8,4),
  cpc         numeric(14,4),
  cpm         numeric(14,4),
  roas        numeric(14,4),
  raw         jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  unique (level, entity_id, platform, date)
);
create index idx_metrics_client_date on metrics_daily (client_id, date);
create index idx_metrics_entity      on metrics_daily (level, entity_id, date);
