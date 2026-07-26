-- ============================================================
-- 0008_ad_account_model.sql — Como a conta de anúncios de cada cliente é organizada
--
-- Decisão do usuário (2026-07-26): a 4Him trabalha com OS DOIS modelos,
-- escolhendo por cliente. Em ambos, quem paga o Meta é o cliente com o
-- cartão dele — muda apenas onde a conta de anúncios mora.
-- ============================================================

create type ad_account_model as enum (
  -- A conta vive no Business Manager do próprio cliente e ele concede
  -- acesso de parceiro à 4Him. Na saída, ele já é dono de tudo.
  'client_owned',
  -- A 4Him cria a conta dentro do Business Manager dela; o cliente
  -- adiciona o cartão dele nessa conta. Prático para cliente pequeno,
  -- mas exige transferência se a parceria acabar.
  'agency_owned'
);

-- Saúde da forma de pagamento no Meta — base do alerta "a conta vai cair".
create type billing_health as enum ('unknown', 'ok', 'missing', 'failing');

alter table clients
  add column ad_account_model ad_account_model not null default 'agency_owned',
  add column billing_health   billing_health   not null default 'unknown',
  add column billing_checked_at timestamptz,
  -- Business Manager do cliente (necessário no modelo client_owned).
  add column meta_business_id text;

comment on column clients.ad_account_model is
  'client_owned = conta no BM do cliente (ele concede acesso de parceiro). agency_owned = conta no BM da 4Him com o cartão do cliente.';
comment on column clients.billing_health is
  'Situação da forma de pagamento no Meta. Alimenta o alerta antes da conta parar.';
