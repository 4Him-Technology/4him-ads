-- ============================================================
-- 0007_billing.sql — Cobrança recorrente do serviço da agência
--
-- ⚠️ NENHUM dado de cartão é armazenado aqui. O pagamento acontece no
-- checkout hospedado do provedor (Asaas); guardamos apenas o status e os
-- identificadores devolvidos por ele.
--
-- Os campos `asaas_*` ficam isolados de propósito: quando a conta migrar
-- de pessoa física para jurídica, basta limpá-los e recriar lá, sem
-- perder nosso histórico de planos, assinaturas e faturas.
-- ============================================================

create type billing_cycle       as enum ('monthly', 'quarterly', 'yearly');
create type subscription_status as enum ('trialing', 'active', 'past_due', 'suspended', 'cancelled');
create type invoice_status      as enum ('pending', 'paid', 'overdue', 'refunded', 'cancelled');
create type payment_method      as enum ('pix', 'boleto', 'credit_card', 'other');

-- ---------- plans (o que a 4Him vende) ----------
create table plans (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  name         text not null,
  description  text,
  amount       numeric(12,2) not null check (amount >= 0),
  cycle        billing_cycle not null default 'monthly',
  -- Modelo híbrido: percentual sobre a verba acima de um limite.
  spend_fee_pct    numeric(5,2) check (spend_fee_pct >= 0 and spend_fee_pct <= 100),
  spend_threshold  numeric(12,2) check (spend_threshold >= 0),
  features     jsonb not null default '[]'::jsonb,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_plans_org on plans (org_id);
create trigger trg_plan_updated before update on plans
  for each row execute function set_updated_at();

-- ---------- subscriptions (cliente ↔ plano) ----------
create table subscriptions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  client_id     uuid not null references clients(id) on delete cascade,
  plan_id       uuid references plans(id) on delete set null,
  status        subscription_status not null default 'trialing',
  amount        numeric(12,2) not null check (amount >= 0),
  cycle         billing_cycle not null default 'monthly',
  started_at    date not null default current_date,
  next_due_date date,
  cancelled_at  timestamptz,
  -- Identificadores do provedor (trocáveis na migração PF → PJ)
  asaas_subscription_id text unique,
  asaas_customer_id     text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_subs_client on subscriptions (client_id);
create index idx_subs_status on subscriptions (org_id, status);
create trigger trg_sub_updated before update on subscriptions
  for each row execute function set_updated_at();

-- ---------- invoices (faturas geradas) ----------
create table invoices (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  client_id       uuid not null references clients(id) on delete cascade,
  subscription_id uuid references subscriptions(id) on delete set null,
  description     text,
  amount          numeric(12,2) not null check (amount >= 0),
  due_date        date not null,
  paid_at         timestamptz,
  status          invoice_status not null default 'pending',
  method          payment_method,
  -- Links do provedor: página de pagamento e boleto. Não guardamos cartão.
  asaas_payment_id text unique,
  invoice_url      text,
  bank_slip_url    text,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_invoices_client on invoices (client_id, due_date desc);
create index idx_invoices_status on invoices (org_id, status);
create trigger trg_invoice_updated before update on invoices
  for each row execute function set_updated_at();

-- ---------- payment_events (webhooks recebidos) ----------
-- Guardar o id do evento garante idempotência: o Asaas reenvia webhooks
-- quando não recebe confirmação, e não podemos processar duas vezes.
create table payment_events (
  id             uuid primary key default gen_random_uuid(),
  provider       text not null default 'asaas',
  provider_event_id text not null,
  event_type     text not null,
  payload        jsonb not null,
  processed_at   timestamptz,
  error          text,
  created_at     timestamptz not null default now(),
  unique (provider, provider_event_id)
);
create index idx_payment_events_created on payment_events (created_at desc);

-- ---------- vínculo do cliente com o provedor ----------
alter table clients add column asaas_customer_id text;
create index idx_clients_asaas on clients (asaas_customer_id);

-- ============================================================
-- RLS
-- ============================================================

alter table plans          enable row level security;
alter table subscriptions  enable row level security;
alter table invoices       enable row level security;
alter table payment_events enable row level security;

-- Planos: equipe gerencia; cliente enxerga o plano que assina (via subscription).
create policy plans_staff_all on plans for all
  using (is_org_member(org_id)) with check (is_org_member(org_id));

-- Assinaturas: equipe gerencia; o cliente vê a sua (transparência no portal).
create policy subs_read on subscriptions for select using (has_client_access(client_id));
create policy subs_staff_write on subscriptions for all
  using (is_org_member(org_id)) with check (is_org_member(org_id));

-- Faturas: o cliente precisa ver as suas para poder pagar.
create policy invoices_read on invoices for select using (has_client_access(client_id));
create policy invoices_staff_write on invoices for all
  using (is_org_member(org_id)) with check (is_org_member(org_id));

-- Eventos de webhook: nenhuma política = ninguém lê pela API.
-- Só a service_role (que ignora RLS) grava aqui.

comment on table payment_events is
  'Webhooks do provedor de pagamento. Sem acesso via API; garante idempotência.';
comment on column subscriptions.asaas_subscription_id is
  'Id no provedor. Migração PF → PJ: limpar e recriar, preservando o histórico local.';
