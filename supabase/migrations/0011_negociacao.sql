-- ============================================================
-- 0011_negociacao.sql — Valores negociáveis por cliente + dados cadastrais
--
-- Decisão (2026-07-26): negociar é a regra, não a exceção. O plano passa
-- a ser um MODELO (sugestão de preço); a assinatura guarda o CONTRATO
-- REAL daquele cliente. Assim dá para fechar por R$900 ou R$1.800 sem
-- criar um plano novo a cada negociação.
--
-- Toda condição variável é sobrescrevível: quando NULL, vale o plano.
-- ============================================================

-- ---------- dados cadastrais do cliente ----------
alter table clients
  add column document      text,          -- CPF ou CNPJ do pagador
  add column contact_name  text,
  add column contact_email citext,
  add column contact_phone text,
  add column segment       text,          -- nicho: alimentação, moda... (insumo do Radar)
  add column notes         text;

comment on column clients.segment is
  'Nicho do cliente. Alimenta o Radar de mercado (ver [[diferenciais]]).';

-- ---------- condições negociadas na assinatura ----------
-- NULL = herda do plano. Preenchido = condição negociada com este cliente.
alter table subscriptions
  add column setup_fee             numeric(12,2) check (setup_fee >= 0),
  add column variable_metric       billing_metric,
  add column variable_threshold    numeric(14,2) check (variable_threshold >= 0),
  add column variable_pct          numeric(5,2)  check (variable_pct >= 0 and variable_pct <= 100),
  add column variable_cap          numeric(14,2) check (variable_cap >= 0),
  add column variable_grace_months integer       check (variable_grace_months >= 0 and variable_grace_months <= 24),
  add column notes                 text;

comment on column subscriptions.variable_pct is
  'Condição negociada. NULL = usa o valor do plano.';
comment on column subscriptions.setup_fee is
  'Valor da implantação acordado. Cobrado uma vez, no início do contrato.';

-- ------------------------------------------------------------
-- Apuração passa a respeitar o que foi negociado, caindo para o
-- plano quando não houver condição específica.
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
  v_valor    numeric := 0;
  v_exced    numeric := 0;
  v_total    numeric := 0;
begin
  -- coalesce: o negociado na assinatura vence o padrão do plano.
  select s.client_id,
         s.started_at,
         coalesce(s.variable_metric,       p.variable_metric),
         coalesce(s.variable_threshold,    p.variable_threshold,    0),
         coalesce(s.variable_pct,          p.variable_pct,          0),
         coalesce(s.variable_cap,          p.variable_cap),
         coalesce(s.variable_grace_months, p.variable_grace_months, 0)
    into v_client, v_inicio, v_metric, v_thr, v_pct, v_cap, v_meses
  from subscriptions s
  left join plans p on p.id = s.plan_id
  where s.id = p_subscription;

  if v_metric is null or v_pct = 0 then
    return;
  end if;

  v_carencia := v_inicio + (v_meses || ' months')::interval;

  if p_fim < v_carencia then
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
  'Apura a parte variável respeitando as condições negociadas na assinatura (com fallback para o plano) e a carência de maturação.';
