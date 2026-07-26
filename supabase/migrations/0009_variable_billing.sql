-- ============================================================
-- 0009_variable_billing.sql — Parte variável da mensalidade por meta
--
-- Decisão (2026-07-26): o percentual não é fixo sobre a verba — ele é
-- disparado quando o cliente ATINGE UMA META. A métrica é configurável
-- por plano, porque a régua muda de cliente para cliente:
--
--   ad_spend    → % sobre a verba que passar do limite (mensurável hoje)
--   revenue     → % sobre a receita gerada acima do limite (exige CRM)
--   conversions → % sobre conversões acima do limite
--   leads       → % sobre leads acima do limite
--
-- Cobrar sobre RESULTADO alinha o incentivo (só ganhamos mais se o
-- cliente vender mais); cobrar sobre VERBA é mensurável desde já.
-- ============================================================

create type billing_metric as enum ('ad_spend', 'revenue', 'conversions', 'leads');

-- ---------- generaliza os campos do plano ----------
alter table plans
  add column variable_metric    billing_metric,
  add column variable_threshold numeric(14,2) check (variable_threshold >= 0),
  add column variable_pct       numeric(5,2)  check (variable_pct >= 0 and variable_pct <= 100),
  -- Teto opcional: evita conta inesperada e o pedido de renegociação
  -- justamente no mês em que o cliente foi bem.
  add column variable_cap       numeric(14,2) check (variable_cap >= 0);

-- Migra o que existia (as colunas antigas eram específicas de verba).
update plans
   set variable_metric    = 'ad_spend',
       variable_threshold = spend_threshold,
       variable_pct       = spend_fee_pct
 where spend_fee_pct is not null;

alter table plans
  drop column spend_fee_pct,
  drop column spend_threshold;

comment on column plans.variable_metric is
  'Métrica que dispara a parte variável. NULL = plano só com valor fixo.';
comment on column plans.variable_cap is
  'Teto do valor variável no período. NULL = sem teto.';

-- ---------- apuração mensal ----------
-- Guardamos o CÁLCULO, não só o resultado: é o que permite mostrar ao
-- cliente exatamente como se chegou ao valor. Base da confiança.
create table variable_charges (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  client_id       uuid not null references clients(id) on delete cascade,
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  period_start    date not null,
  period_end      date not null,
  metric          billing_metric not null,
  metric_value    numeric(14,2) not null default 0,
  threshold       numeric(14,2) not null default 0,
  pct             numeric(5,2)  not null default 0,
  cap             numeric(14,2),
  amount          numeric(14,2) not null default 0,
  invoice_id      uuid references invoices(id) on delete set null,
  approved_at     timestamptz,
  approved_by     uuid references profiles(id),
  created_at      timestamptz not null default now(),
  unique (subscription_id, period_start)
);
create index idx_varcharges_client on variable_charges (client_id, period_start desc);

alter table variable_charges enable row level security;

-- O cliente enxerga a própria apuração: se paga por meta, precisa conferir.
create policy varcharges_read on variable_charges
  for select using (has_client_access(client_id));
create policy varcharges_staff_write on variable_charges
  for all using (is_org_member(org_id)) with check (is_org_member(org_id));

-- ------------------------------------------------------------
-- Apura a parte variável de uma assinatura num período.
-- Somente calcula — não cobra. A cobrança só é gerada depois que a
-- equipe confere, para nunca faturar em cima de dado errado.
-- ------------------------------------------------------------
create or replace function calcular_variavel(
  p_subscription uuid,
  p_inicio       date,
  p_fim          date
)
returns table (
  metric       billing_metric,
  metric_value numeric,
  threshold    numeric,
  pct          numeric,
  excedente    numeric,
  amount       numeric
)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_client uuid;
  v_metric billing_metric;
  v_thr    numeric;
  v_pct    numeric;
  v_cap    numeric;
  v_valor  numeric := 0;
  v_exced  numeric := 0;
  v_total  numeric := 0;
begin
  select s.client_id, p.variable_metric, coalesce(p.variable_threshold, 0),
         coalesce(p.variable_pct, 0), p.variable_cap
    into v_client, v_metric, v_thr, v_pct, v_cap
  from subscriptions s
  join plans p on p.id = s.plan_id
  where s.id = p_subscription;

  -- Plano sem parte variável: nada a apurar.
  if v_metric is null or v_pct = 0 then
    return;
  end if;

  select coalesce(sum(
           case v_metric
             when 'ad_spend'    then m.spend
             when 'revenue'     then m.revenue
             when 'conversions' then m.conversions
             when 'leads'       then m.conversions
           end
         ), 0)
    into v_valor
  from metrics_daily m
  where m.client_id = v_client
    and m.level = 'account'
    and m.date between p_inicio and p_fim;

  v_exced := greatest(v_valor - v_thr, 0);
  v_total := round(v_exced * v_pct / 100, 2);

  if v_cap is not null then
    v_total := least(v_total, v_cap);
  end if;

  return query select v_metric, v_valor, v_thr, v_pct, v_exced, v_total;
end;
$$;

comment on function calcular_variavel is
  'Apura a parte variável no período. Só calcula; a cobrança é gerada após conferência da equipe.';
