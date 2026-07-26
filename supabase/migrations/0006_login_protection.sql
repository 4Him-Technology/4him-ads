-- ============================================================
-- 0006_login_protection.sql — Proteção contra força bruta no login
--
-- O limite por IP em memória (Fastify) some quando a API reinicia e não
-- segura ataque distribuído. Aqui o histórico fica no banco e o bloqueio
-- é POR CONTA — mil IPs diferentes atacando o mesmo e-mail continuam
-- limitados a poucas tentativas.
-- ============================================================

create table auth_attempts (
  id         bigserial primary key,
  email      citext not null,
  ip         inet,
  success    boolean not null,
  created_at timestamptz not null default now()
);

create index idx_auth_attempts_email on auth_attempts (email, created_at desc);
create index idx_auth_attempts_ip    on auth_attempts (ip, created_at desc);

-- Ninguém acessa esta tabela pela API: sem políticas, o RLS nega tudo.
-- Só a service_role (que ignora RLS) escreve aqui.
alter table auth_attempts enable row level security;

-- ------------------------------------------------------------
-- Parâmetros do bloqueio
--   conta: 5 falhas em 15 min  → bloqueia 15 min
--   IP:   20 falhas em 15 min  → bloqueia 30 min
-- ------------------------------------------------------------

create or replace function login_block_status(p_email citext, p_ip inet)
returns table (blocked boolean, retry_after_seconds integer, reason text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_email_fails int;
  v_ip_fails    int;
  v_last_fail   timestamptz;
begin
  -- Falhas recentes desta conta (zeradas por um login bem-sucedido)
  select count(*), max(created_at)
    into v_email_fails, v_last_fail
  from auth_attempts a
  where a.email = p_email
    and a.created_at > now() - interval '15 minutes'
    and not a.success
    and a.created_at > coalesce(
      (select max(s.created_at) from auth_attempts s
        where s.email = p_email and s.success),
      '-infinity'::timestamptz
    );

  if v_email_fails >= 5 then
    return query select
      true,
      greatest(1, extract(epoch from (v_last_fail + interval '15 minutes' - now()))::int),
      'conta temporariamente bloqueada por excesso de tentativas';
    return;
  end if;

  -- Falhas recentes deste IP (contra varredura de vários e-mails)
  if p_ip is not null then
    select count(*), max(created_at)
      into v_ip_fails, v_last_fail
    from auth_attempts a
    where a.ip = p_ip
      and a.created_at > now() - interval '15 minutes'
      and not a.success;

    if v_ip_fails >= 20 then
      return query select
        true,
        greatest(1, extract(epoch from (v_last_fail + interval '30 minutes' - now()))::int),
        'muitas tentativas a partir deste endereço';
      return;
    end if;
  end if;

  return query select false, 0, null::text;
end;
$$;

create or replace function register_login_attempt(p_email citext, p_ip inet, p_success boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into auth_attempts (email, ip, success) values (p_email, p_ip, p_success);

  -- Limpeza oportunista: mantém a tabela enxuta sem precisar de agendador.
  if random() < 0.01 then
    delete from auth_attempts where created_at < now() - interval '30 days';
  end if;
end;
$$;

-- Estas funções só podem ser chamadas pelo servidor (service_role).
-- Sem isto, qualquer visitante poderia sondá-las pela API pública.
revoke execute on function login_block_status(citext, inet) from public, anon, authenticated;
revoke execute on function register_login_attempt(citext, inet, boolean) from public, anon, authenticated;

comment on table auth_attempts is
  'Histórico de tentativas de login. Base do bloqueio por força bruta. Sem acesso via API.';
