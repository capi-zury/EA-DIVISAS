-- 010: módulo Cripto — extensión 1:1 de operations.
--
-- Tres precios SIEMPRE separados (market_price / buy_price / sell_price) y
-- cuatro costos/comisiones SIEMPRE separados (provider_fee_buy,
-- provider_fee_sell, network_fee, customer_fee) — nunca se fusionan.
-- Activo y red son columnas independientes: una cripto puede existir en
-- varias redes (USDT en Ethereum, Tron, Polygon, ...).

create table if not exists divisas.crypto_transactions (
  operation_id uuid primary key references divisas.operations(id) on delete cascade,

  crypto_asset_code text not null references divisas.crypto_assets(code),
  crypto_network_id uuid not null references divisas.crypto_networks(id),

  tx_hash text,                          -- identificador de la transacción blockchain — nunca se inventa/modifica
  wallet_origin_address text,
  wallet_destination_address text,
  wallet_origin_id uuid references divisas.wallets(id),
  wallet_destination_id uuid references divisas.wallets(id),

  quantity numeric(28,8) not null,

  -- A) precio de mercado (referencia), B) precio de compra (costo real EA),
  -- C) precio de venta (lo que se le cobró al cliente). Nunca se fusionan.
  market_price numeric(18,8) not null,
  buy_price numeric(18,8) not null,
  sell_price numeric(18,8) not null,
  fx_rate_mxn_usd numeric(18,8),         -- opcional, si la operación necesita cruce MXN/USD

  -- E) comisión del proveedor/exchange, separada en compra y venta.
  provider_fee_buy numeric(18,8) not null default 0,
  provider_fee_sell numeric(18,8) not null default 0,
  -- F) comisión de red/gas — depende de la blockchain, nunca se asume fija.
  network_fee numeric(18,8) not null default 0,
  -- G) comisión cobrada al cliente — explícita, aparte del spread.
  customer_fee_fixed numeric(18,4) not null default 0,
  customer_fee_percent numeric(9,4) not null default 0,
  customer_fee_amount numeric(18,4) not null default 0,

  -- D) spread — diferencia entre precio de mercado y precio aplicado, por pata.
  spread_buy numeric(18,4) not null default 0,
  spread_sell numeric(18,4) not null default 0,

  acquisition_cost numeric(18,4) not null default 0,
  total_revenue numeric(18,4) not null default 0
);

create index if not exists crypto_transactions_asset_idx on divisas.crypto_transactions (crypto_asset_code);
create index if not exists crypto_transactions_tx_hash_idx on divisas.crypto_transactions (tx_hash);

comment on table divisas.crypto_transactions is 'Campos específicos de cripto. tx_hash/wallets permiten auditar la operación en la blockchain después.';

drop trigger if exists crypto_transactions_audit on divisas.crypto_transactions;
create trigger crypto_transactions_audit
  after insert or update or delete on divisas.crypto_transactions
  for each row execute function divisas.audit_row_change();
