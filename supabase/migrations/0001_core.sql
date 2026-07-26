-- ============================================================
-- 0001_core.sql — Núcleo multi-tenant
-- organizações (agência), perfis, memberships, clientes, acessos + helpers de RLS
-- ============================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------- Enums ----------
create type membership_role as enum ('owner', 'admin', 'manager', 'analyst', 'client');
create type client_status   as enum ('active', 'paused', 'archived');

-- ---------- Helper: updated_at ----------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- organizations (tenant raiz = a agência; hoje a 4Him, pronto p/ white-label) ----------
create table organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       citext unique not null,
  logo_url   text,
  brand      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_org_updated before update on organizations
  for each row execute function set_updated_at();

-- ---------- profiles (1:1 com auth.users do Supabase) ----------
create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  full_name       text,
  email           citext,
  avatar_url      text,
  is_agency_staff boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger trg_profile_updated before update on profiles
  for each row execute function set_updated_at();

-- ---------- memberships (papéis no nível da organização — equipe da agência) ----------
create table memberships (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  role       membership_role not null default 'analyst',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index idx_memberships_user on memberships (user_id);
create index idx_memberships_org  on memberships (org_id);

-- ---------- clients (as marcas/clientes atendidos pela agência) ----------
create table clients (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  slug        citext not null,
  status      client_status not null default 'active',
  logo_url    text,
  brand_color text,
  timezone    text not null default 'America/Sao_Paulo',
  currency    text not null default 'BRL',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, slug)
);
create index idx_clients_org on clients (org_id);
create trigger trg_client_updated before update on clients
  for each row execute function set_updated_at();

-- ---------- client_access (quais usuários — sobretudo do lado cliente — acessam cada cliente) ----------
create table client_access (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references clients(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  can_edit   boolean not null default false,
  created_at timestamptz not null default now(),
  unique (client_id, user_id)
);
create index idx_client_access_user on client_access (user_id);

-- ============================================================
-- Helpers de RLS (security definer p/ evitar recursão de política)
-- ============================================================

create or replace function auth_org_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select org_id from memberships where user_id = auth.uid();
$$;

create or replace function is_org_member(p_org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships
    where user_id = auth.uid() and org_id = p_org
  );
$$;

create or replace function has_client_access(p_client uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from clients c
    where c.id = p_client
      and (
        is_org_member(c.org_id)  -- staff da agência vê tudo da org
        or exists (
          select 1 from client_access ca
          where ca.client_id = c.id and ca.user_id = auth.uid()
        )
      )
  );
$$;
