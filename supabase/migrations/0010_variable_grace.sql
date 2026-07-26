-- ============================================================
-- 0010_variable_grace.sql — Carência antes da parte variável valer
--
-- Decisão (2026-07-26): tráfego pago leva de 60 a 90 dias para amadurecer
-- (as plataformas precisam de dados para otimizar). Cobrar percentual
-- durante a maturação é injusto: o resultado ainda está se formando e
-- o gasto inicial costuma ser de aprendizado.
--
-- Por isso a parte variável só passa a valer após N meses do início do
-- contrato. Nesse período o cliente paga apenas o valor fixo.
-- ============================================================

alter table plans
  add column variable_grace_months integer not null default 3
    check (variable_grace_months >= 0 and variable_grace_months <= 24);

comment on column plans.variable_grace_months is
  'Meses de carência a partir do início do contrato antes da parte variável ser cobrada. Padrão 3 (tempo de maturação do tráfego).';

-- ------------------------------------------------------------
-- Reescreve a apuração levando a carência em conta.
-- Passa a devolver também o estado da carência, para a interface
-- explicar ao cliente por que o valor variável está zerado.
-- ------------------------------------------------------------
drop function if exists calcular_variavel(uuid, date, date);

create or replace function calcular_variavel(
  p_subscription uuid,
  p_inicio       date,
  p_fim          date
)
returns table (
  metric        billing_metric,
  metric_value  numeric,
  threshold     numeric,
  pct           numeric,
  excedente     numeric,
  amount        numeric,
  em_carencia   boolean,
  carencia_ate  date
)
language plpgsql stable security invoker set search_path = public as $$
declare
  v_client   uuid;
  v_inicio   date;
  v_metric   billing_metric;
  v_thr      numeric;
  v_pct      numeric;
  v_cap      numeric;
  v_meses    integer;
  v_carencia date;
  v_ativa    boolean;
  v_valor    numeric := 0;
  v_exced    numeric := 0;
  v_total    numeric := 0;
begin
  select s.client_id, s.started_at, p.variable_metric,
         coalesce(p.variable_threshold, 0), coalesce(p.variable_pct, 0),
         p.variable_cap, coalesce(p.variable_grace_months, 0)
    into v_client, v_inicio, v_metric, v_thr, v_pct, v_cap, v_meses
  from subscriptions s
  join plans p on p.id = s.plan_id
  where s.id = p_subscription;

  -- Plano sem parte variável: nada a apurar.
  if v_metric is null or v_pct = 0 then
    return;
  end if;

  v_carencia := v_inicio + (v_meses || ' months')::interval;
  -- A carência vale enquanto o período apurado terminar antes do prazo.
  v_ativa := p_fim < v_carencia;

  if v_ativa then
    return query select v_metric, 0::numeric, v_thr, v_pct, 0::numeric, 0::numeric, true, v_carencia;
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

  return query select v_metric, v_valor, v_thr, v_pct, v_exced, v_total, false, v_carencia;
end;
$$;

comment on function calcular_variavel is
  'Apura a parte variável no período, respeitando a carência de maturação. Só calcula; a cobrança é gerada após conferência da equipe.';

-- ------------------------------------------------------------
-- Panorama financeiro da agência (usado no topo da tela de cobrança).
-- Roda sob RLS: um usuário-cliente não obtém números da agência.
-- ------------------------------------------------------------
create or replace function resumo_financeiro()
returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'mrr', (
      select coalesce(sum(
        case cycle when 'monthly' then amount
                   when 'quarterly' then amount / 3
                   when 'yearly' then amount / 12 end
      ), 0)
      from subscriptions where status in ('active', 'trialing')
    ),
    'assinaturas_ativas',  (select count(*) from subscriptions where status = 'active'),
    'em_carencia',         (select count(*) from subscriptions where status = 'trialing'),
    'inadimplentes',       (select count(*) from subscriptions where status in ('past_due', 'suspended')),
    'a_receber', (
      select coalesce(sum(amount), 0) from invoices
      where status in ('pending', 'overdue')
    ),
    'vencidas', (
      select coalesce(sum(amount), 0) from invoices where status = 'overdue'
    ),
    'recebido_mes', (
      select coalesce(sum(amount), 0) from invoices
      where status = 'paid' and paid_at >= date_trunc('month', now())
    )
  );
$$;
