-- ============================================================
-- 0004_rls.sql — Row Level Security (habilita + políticas)
-- Padrão: leitura = has_client_access(client_id); escrita de negócio = staff (is_org_member).
-- metrics_daily: escrita só via service role (jobs de sync ignoram RLS).
-- ============================================================

alter table organizations        enable row level security;
alter table profiles             enable row level security;
alter table memberships          enable row level security;
alter table clients              enable row level security;
alter table client_access        enable row level security;
alter table platform_connections enable row level security;
alter table ad_accounts          enable row level security;
alter table campaigns            enable row level security;
alter table ad_sets              enable row level security;
alter table creatives            enable row level security;
alter table ads                  enable row level security;
alter table metrics_daily        enable row level security;
alter table tasks                enable row level security;
alter table task_comments        enable row level security;
alter table approvals            enable row level security;
alter table alert_rules          enable row level security;
alter table alerts               enable row level security;
alter table audit_log            enable row level security;

-- ---------- profiles ----------
create policy profiles_self_select on profiles for select using (id = auth.uid());
create policy profiles_self_update on profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- ---------- organizations ----------
create policy org_member_select on organizations for select using (is_org_member(id));

-- ---------- memberships ----------
create policy memberships_select on memberships for select using (is_org_member(org_id));

-- ---------- clients ----------
create policy clients_read  on clients for select using (has_client_access(id));
create policy clients_write on clients for all using (is_org_member(org_id)) with check (is_org_member(org_id));

-- ---------- client_access ----------
create policy client_access_read on client_access for select using (has_client_access(client_id));
create policy client_access_write on client_access for all
  using      (exists (select 1 from clients c where c.id = client_id and is_org_member(c.org_id)))
  with check (exists (select 1 from clients c where c.id = client_id and is_org_member(c.org_id)));

-- ---------- platform_connections (tokens: SÓ staff) ----------
create policy conn_staff_all on platform_connections for all
  using (is_org_member(org_id)) with check (is_org_member(org_id));

-- ---------- ad_accounts ----------
create policy adacct_read  on ad_accounts for select using (has_client_access(client_id));
create policy adacct_write on ad_accounts for all using (is_org_member(org_id)) with check (is_org_member(org_id));

-- ---------- campaigns ----------
create policy campaigns_read  on campaigns for select using (has_client_access(client_id));
create policy campaigns_write on campaigns for all using (is_org_member(org_id)) with check (is_org_member(org_id));

-- ---------- ad_sets ----------
create policy adsets_read  on ad_sets for select using (has_client_access(client_id));
create policy adsets_write on ad_sets for all using (is_org_member(org_id)) with check (is_org_member(org_id));

-- ---------- creatives ----------
create policy creatives_read  on creatives for select using (has_client_access(client_id));
create policy creatives_write on creatives for all using (is_org_member(org_id)) with check (is_org_member(org_id));

-- ---------- ads ----------
create policy ads_read  on ads for select using (has_client_access(client_id));
create policy ads_write on ads for all using (is_org_member(org_id)) with check (is_org_member(org_id));

-- ---------- metrics_daily (só leitura no app) ----------
create policy metrics_read on metrics_daily for select using (has_client_access(client_id));

-- ---------- tasks (cliente vê só as visíveis) ----------
create policy tasks_read on tasks for select using (
  (client_id is not null and has_client_access(client_id) and (visible_to_client or is_org_member(org_id)))
  or (client_id is null and is_org_member(org_id))
);
create policy tasks_write on tasks for all using (is_org_member(org_id)) with check (is_org_member(org_id));

-- ---------- task_comments ----------
create policy task_comments_read on task_comments for select using (
  exists (select 1 from tasks t where t.id = task_id
          and (t.client_id is not null and has_client_access(t.client_id) or is_org_member(t.org_id)))
);
create policy task_comments_insert on task_comments for insert with check (
  exists (select 1 from tasks t where t.id = task_id
          and (t.client_id is not null and has_client_access(t.client_id) or is_org_member(t.org_id)))
);

-- ---------- approvals (cliente lê e decide; staff gerencia) ----------
create policy approvals_read          on approvals for select using (has_client_access(client_id));
create policy approvals_client_update on approvals for update using (has_client_access(client_id)) with check (has_client_access(client_id));
create policy approvals_staff_all     on approvals for all using (is_org_member(org_id)) with check (is_org_member(org_id));

-- ---------- alert_rules (staff) ----------
create policy alert_rules_all on alert_rules for all using (is_org_member(org_id)) with check (is_org_member(org_id));

-- ---------- alerts ----------
create policy alerts_read        on alerts for select using (
  is_org_member(org_id) or (client_id is not null and has_client_access(client_id))
);
create policy alerts_staff_write on alerts for all using (is_org_member(org_id)) with check (is_org_member(org_id));

-- ---------- audit_log (staff lê) ----------
create policy audit_read on audit_log for select using (org_id is not null and is_org_member(org_id));
