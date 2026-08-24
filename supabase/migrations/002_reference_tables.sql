-- 002: tablas de referencia/catálogo — monedas, activos cripto, redes, proveedores.
-- Estas no cambian por operación; las operaciones las referencian por FK.

create table if not exists divisas.currencies (
  code text primary key,               -- 'MXN', 'USD', 'EUR', ...
  name text not null,
  symbol text not null,
  decimals smallint not null default 2,
  active boolean not null default true
);

create table if not exists divisas.crypto_assets (
  code text primary key,               -- 'BTC', 'ETH', 'USDT', 'USDC', ...
  name text not null,
  decimals smallint not null default 8,
  active boolean not null default true
);

create table if not exists divisas.crypto_networks (
  id uuid primary key default gen_random_uuid(),
  crypto_asset_code text not null references divisas.crypto_assets(code),
  network_name text not null,          -- 'Ethereum', 'Tron', 'Polygon', 'Solana', ...
  active boolean not null default true,
  unique (crypto_asset_code, network_name)
);

create table if not exists divisas.providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'general', -- 'exchange', 'banco', 'remesadora', 'general'
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table divisas.currencies is 'Catálogo de monedas fiat usadas por transferencias y efectivo.';
comment on table divisas.crypto_assets is 'Catálogo de criptomonedas. Una cripto puede existir en varias redes — ver crypto_networks.';
comment on table divisas.crypto_networks is 'Redes/blockchains disponibles por activo (ej. USDT en Ethereum, Tron, Polygon...). Nunca asumir una sola red por activo.';
comment on table divisas.providers is 'Proveedores/exchanges/bancos usados para ejecutar operaciones — costos de proveedor se registran por operación, referenciando esta tabla.';
