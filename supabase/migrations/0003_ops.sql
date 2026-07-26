-- ============================================================
-- 0003_ops.sql — Operação: tarefas, aprovações, alertas, auditoria
-- ============================================================

-- ---------- Enums ----------
create type task_status      as enum ('backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled');
create type task_priority    as enum ('low', 'medium', 'high', 'urgent');
create type approval_subject as enum ('creative', 'campaign', 'report');
create type approval_status  as enum ('pending', 'approved', 'changes_requested', 'rejected');
create type alert_severity   as enum ('info', 'warning', 'critical');
create type alert_status     as enum ('open', 'acknowledged', 'resolved');

-- ---------- tasks (a agência executa; o cliente acompanha) ----------
create table tasks (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id) on delete cascade,
  client_id         uuid references clients(id) on delete cascade,
  title             text not null,
  description       text,
  status            task_status not null default 'todo',
  priority          task_priority not null default 'medium',
  assignee_id       uuid references profiles(id),
  created_by        uuid references profiles(id),
  due_date          date,
  visible_to_client boolean not null default true,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_tasks_client   on tasks (client_id);
create index idx_tasks_assignee on tasks (assignee_id);
create trigger trg_task_updated before update on tasks
  for each row execute function set_updated_at();

create table task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks(id) on delete cascade,
  author_id  uuid references profiles(id),
  body       text not null,
  created_at timestamptz not null default now()
);
create index idx_task_comments_task on task_comments (task_id);

-- ---------- approvals (cliente aprova criativos / campanhas / relatórios) ----------
create table approvals (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  client_id    uuid not null references clients(id) on delete cascade,
  subject_type approval_subject not null,
  subject_id   uuid not null,
  status       approval_status not null default 'pending',
  note         text,
  requested_by uuid references profiles(id),
  decided_by   uuid references profiles(id),
  decided_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_approvals_client  on approvals (client_id);
create index idx_approvals_subject on approvals (subject_type, subject_id);
create trigger trg_approval_updated before update on approvals
  for each row execute function set_updated_at();

-- ---------- alert_rules ----------
create table alert_rules (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  client_id   uuid references clients(id) on delete cascade,
  name        text not null,
  metric      text not null,               -- spend, roas, cpa, ctr, budget_utilization...
  operator    text not null,               -- >, <, >=, <=, ==, pct_change
  threshold   numeric(14,4) not null,
  -- "window" é palavra reservada no Postgres (window functions) → time_window
  time_window text not null default '1d',   -- 1h, 1d, 7d
  scope_level metric_level,                 -- nível ao qual a regra se aplica (opcional)
  channels    jsonb not null default '[]'::jsonb,   -- ['email','inapp','whatsapp']
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_alert_rules_org on alert_rules (org_id);
create trigger trg_alertrule_updated before update on alert_rules
  for each row execute function set_updated_at();

-- ---------- alerts (disparados) ----------
create table alerts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  client_id   uuid references clients(id) on delete cascade,
  rule_id     uuid references alert_rules(id) on delete set null,
  severity    alert_severity not null default 'warning',
  title       text not null,
  message     text,
  entity_ref  jsonb not null default '{}'::jsonb,   -- {level, entity_id, platform}
  status      alert_status not null default 'open',
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index idx_alerts_client_status on alerts (client_id, status);
create index idx_alerts_org_created   on alerts (org_id, created_at);

-- ---------- audit_log ----------
create table audit_log (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid references organizations(id) on delete set null,
  actor_id     uuid references profiles(id),
  action       text not null,
  subject_type text,
  subject_id   uuid,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index idx_audit_org_created on audit_log (org_id, created_at);
