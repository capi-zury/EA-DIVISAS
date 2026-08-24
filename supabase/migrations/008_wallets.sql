-- 008: registro de wallets propias de EA Divisas (para poder rastrear qué
-- wallet interna se usó en cada operación cripto). Direcciones de
-- clientes/terceros se guardan como texto libre directamente en
-- crypto_transactions — no todas las direcciones merecen un registro.

create table if not exists divisas.wallets (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  address text not null,
  crypto_network_id uuid not null references divisas.crypto_networks(id),
  owner_type text not null default 'ea_divisas',  -- 'ea_divisas' | 'cliente' | 'proveedor'
  client_id uuid references divisas.clients(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (address, crypto_network_id)
);

comment on table divisas.wallets is 'Wallets internas de EA Divisas por red. Las direcciones de clientes/terceros van como texto libre en crypto_transactions.';
