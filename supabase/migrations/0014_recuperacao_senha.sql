-- ============================================================
-- 0014_recuperacao_senha.sql — Recuperação de senha e trilha de e-mails
--
-- Fluxo próprio (em vez do e-mail padrão do Supabase) porque o front não
-- fala com o Supabase: tudo passa pela nossa API, que controla o envio,
-- o template e o domínio do link.
-- ============================================================

create table password_reset_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  -- Guardamos apenas o HASH: se o banco vazar, os tokens em trânsito
  -- continuam inúteis para o invasor.
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  used_at      timestamptz,
  requested_ip inet,
  created_at   timestamptz not null default now()
);
create index idx_reset_user on password_reset_tokens (user_id, created_at desc);
create index idx_reset_exp  on password_reset_tokens (expires_at);

-- Sem nenhuma política: ninguém lê nem escreve pela API.
-- Só a service_role (que ignora RLS) manipula estes registros.
alter table password_reset_tokens enable row level security;

comment on table password_reset_tokens is
  'Tokens de redefinição de senha. Guarda apenas o hash; uso único; expira em 1h.';

-- ------------------------------------------------------------
-- Registro dos e-mails enviados.
-- Serve para responder "o cliente recebeu?" sem depender do painel do
-- provedor, e para não reenviar o mesmo aviso duas vezes.
-- ------------------------------------------------------------
create type email_status as enum ('queued', 'sent', 'failed', 'skipped');

create table email_log (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references organizations(id) on delete set null,
  to_email    citext not null,
  template    text not null,
  subject     text,
  status      email_status not null default 'queued',
  provider_id text,
  error       text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index idx_email_log_created on email_log (created_at desc);
create index idx_email_log_to      on email_log (to_email, created_at desc);

alter table email_log enable row level security;

-- Só a equipe consulta a trilha de envios.
create policy email_log_staff_read on email_log
  for select using (org_id is not null and is_org_member(org_id));

comment on table email_log is
  'Trilha de e-mails enviados. Responde "o cliente recebeu?" sem depender do painel do provedor.';

-- ------------------------------------------------------------
-- Limpeza de tokens vencidos. Chamada oportunisticamente pela API.
-- ------------------------------------------------------------
create or replace function limpar_tokens_vencidos()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_removidos integer;
begin
  delete from password_reset_tokens
  where expires_at < now() - interval '7 days';
  get diagnostics v_removidos = row_count;
  return v_removidos;
end;
$$;

revoke execute on function limpar_tokens_vencidos() from public, anon, authenticated;
