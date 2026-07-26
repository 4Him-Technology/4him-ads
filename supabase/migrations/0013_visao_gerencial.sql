-- ============================================================
-- 0013_visao_gerencial.sql — Panorama da agência e do cliente
--
-- Duas funções que alimentam as duas telas principais:
--   resumo_gerencial  → a visão da 4Him inteira no período
--   resumo_cliente    → tudo de UM cliente no período
--
-- Ambas SECURITY INVOKER: rodam sob RLS, então um usuário-cliente jamais
-- obtém números da agência nem de outro cliente.
-- ============================================================

create or replace function resumo_gerencial(p_inicio date, p_fim date)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with metricas as (
    select
      coalesce(sum(spend), 0)       as verba,
      coalesce(sum(revenue), 0)     as receita,
      coalesce(sum(conversions), 0) as conversoes,
      coalesce(sum(clicks), 0)      as cliques,
      coalesce(sum(impressions), 0) as impressoes
    from metrics_daily
    where level = 'account' and date between p_inicio and p_fim
  ),
  por_cliente as (
    select
      c.id, c.name, c.status,
      coalesce(sum(m.spend), 0)       as verba,
      coalesce(sum(m.revenue), 0)     as receita,
      coalesce(sum(m.conversions), 0) as conversoes
    from clients c
    left join metrics_daily m
      on m.client_id = c.id
     and m.level = 'account'
     and m.date between p_inicio and p_fim
    where c.status <> 'archived'
    group by c.id, c.name, c.status
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim),

    -- Operação (vem do conector das plataformas)
    'verba',       (select verba from metricas),
    'receita',     (select receita from metricas),
    'conversoes',  (select conversoes from metricas),
    'cliques',     (select cliques from metricas),
    'impressoes',  (select impressoes from metricas),
    'roas', case when (select verba from metricas) > 0
                 then round((select receita from metricas) / (select verba from metricas), 2)
                 else 0 end,
    'cpa', case when (select conversoes from metricas) > 0
                then round((select verba from metricas) / (select conversoes from metricas), 2)
                else 0 end,

    -- Carteira
    'clientes_ativos', (select count(*) from clients where status = 'active'),
    'clientes_total',  (select count(*) from clients where status <> 'archived'),

    -- Receita da agência
    'mrr', (
      select coalesce(sum(
        case cycle when 'monthly' then amount
                   when 'quarterly' then amount / 3
                   when 'yearly' then amount / 12 end
      ), 0)
      from subscriptions where status in ('active', 'trialing')
    ),
    'recebido_periodo', (
      select coalesce(sum(amount), 0) from invoices
      where status = 'paid' and paid_at::date between p_inicio and p_fim
    ),
    'a_receber', (
      select coalesce(sum(amount), 0) from invoices where status in ('pending', 'overdue')
    ),
    'inadimplentes', (
      select count(*) from subscriptions where status in ('past_due', 'suspended')
    ),

    -- Ranking por cliente (a lista da tela)
    'clientes', (
      select coalesce(jsonb_agg(to_jsonb(pc) order by pc.verba desc), '[]'::jsonb)
      from por_cliente pc
    )
  );
$$;

comment on function resumo_gerencial is
  'Panorama da agência no período: operação, carteira e receita. Respeita RLS.';

-- ------------------------------------------------------------
-- Tudo de UM cliente no período — alimenta a tela dedicada dele.
-- ------------------------------------------------------------
create or replace function resumo_cliente(p_client uuid, p_inicio date, p_fim date)
returns jsonb
language sql stable security invoker set search_path = public as $$
  with metricas as (
    select
      coalesce(sum(spend), 0)       as verba,
      coalesce(sum(revenue), 0)     as receita,
      coalesce(sum(conversions), 0) as conversoes,
      coalesce(sum(clicks), 0)      as cliques,
      coalesce(sum(impressions), 0) as impressoes
    from metrics_daily
    where client_id = p_client and level = 'account' and date between p_inicio and p_fim
  ),
  serie as (
    select date, sum(spend) as verba, sum(revenue) as receita, sum(conversions) as conversoes
    from metrics_daily
    where client_id = p_client and level = 'account' and date between p_inicio and p_fim
    group by date order by date
  )
  select jsonb_build_object(
    'verba',      (select verba from metricas),
    'receita',    (select receita from metricas),
    'conversoes', (select conversoes from metricas),
    'cliques',    (select cliques from metricas),
    'impressoes', (select impressoes from metricas),
    'roas', case when (select verba from metricas) > 0
                 then round((select receita from metricas) / (select verba from metricas), 2)
                 else 0 end,
    'cpa', case when (select conversoes from metricas) > 0
                then round((select verba from metricas) / (select conversoes from metricas), 2)
                else 0 end,
    'ctr', case when (select impressoes from metricas) > 0
                then round((select cliques from metricas)::numeric * 100 / (select impressoes from metricas), 2)
                else 0 end,
    'serie', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from serie s),
    'campanhas', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', k.id, 'name', k.name, 'status', k.status,
        'platform', k.platform, 'daily_budget', k.daily_budget
      )), '[]'::jsonb)
      from campaigns k where k.client_id = p_client
    ),
    'criativos_total', (select count(*) from creatives where client_id = p_client),
    'faturas', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'amount', i.amount, 'due_date', i.due_date,
        'status', i.status, 'invoice_url', i.invoice_url
      ) order by i.due_date desc), '[]'::jsonb)
      from invoices i where i.client_id = p_client
    )
  );
$$;

comment on function resumo_cliente is
  'Tudo de um cliente no período: operação, série diária, campanhas e faturas. Respeita RLS.';
