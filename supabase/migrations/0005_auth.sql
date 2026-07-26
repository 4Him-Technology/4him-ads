-- ============================================================
-- 0005_auth.sql — Autenticação: perfis automáticos e contexto do usuário
-- ============================================================

-- ------------------------------------------------------------
-- Cria o profile automaticamente quando nasce um usuário no auth.
-- SECURITY DEFINER porque o insert acontece antes de existir sessão.
-- ------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Mantém o e-mail do profile em sincronia se mudar no auth.
create or replace function handle_user_email_change()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function handle_user_email_change();

-- ------------------------------------------------------------
-- Visibilidade de perfis dentro da mesma organização.
-- Sem isto, a equipe não consegue ver o nome de quem executou uma tarefa.
-- O cliente continua enxergando apenas o próprio perfil.
-- ------------------------------------------------------------
create or replace function shares_org_with(p_user uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from memberships mine
    join memberships theirs on theirs.org_id = mine.org_id
    where mine.user_id = auth.uid()
      and theirs.user_id = p_user
  );
$$;

create policy profiles_same_org_select on profiles
  for select using (shares_org_with(id));

-- ------------------------------------------------------------
-- Papel do usuário na organização (helper para políticas e para a API).
-- ------------------------------------------------------------
create or replace function current_role_in_org(p_org uuid)
returns membership_role
language sql stable security definer set search_path = public as $$
  select role from memberships
  where user_id = auth.uid() and org_id = p_org
  limit 1;
$$;

-- ------------------------------------------------------------
-- Contexto do usuário logado, em uma única chamada.
--
-- SECURITY INVOKER de propósito: roda com as permissões de quem chamou,
-- então o RLS continua valendo. Se o token for inválido, auth.uid() é
-- nulo e o retorno é nulo — não há como vazar dados de outro usuário.
-- ------------------------------------------------------------
create or replace function current_user_context()
returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_profile jsonb;
  v_orgs    jsonb;
  v_clients jsonb;
begin
  if v_uid is null then
    return null;
  end if;

  select to_jsonb(p) into v_profile
  from (
    select id, email, full_name, avatar_url, is_agency_staff
    from profiles where id = v_uid
  ) p;

  select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) into v_orgs
  from (
    select m.org_id, m.role, org.name as org_name, org.slug as org_slug
    from memberships m
    join organizations org on org.id = m.org_id
    where m.user_id = v_uid
  ) o;

  -- Clientes visíveis: staff vê todos da org; usuário-cliente vê os liberados.
  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into v_clients
  from (
    select distinct c.id, c.name, c.slug, c.status, c.currency
    from clients c
    where has_client_access(c.id)
    order by c.name
  ) c;

  return jsonb_build_object(
    'profile', v_profile,
    'organizations', v_orgs,
    'clients', v_clients
  );
end;
$$;

comment on function current_user_context is
  'Perfil, papéis e clientes acessíveis pelo usuário autenticado. Respeita RLS.';
