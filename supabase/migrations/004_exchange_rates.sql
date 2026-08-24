-- 004: tipos de cambio — tabla "viva" (valor actual editable) + historial
-- append-only. Las operaciones NUNCA leen esta tabla en el momento de
-- reportar: cada operación guarda su propio snapshot (buy_rate/sell_rate)
-- al crearse, así que un cambio aquí jamás altera una operación pasada.

create table if not exists divisas.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  pair text not null,                      -- 'USD/MXN', 'EUR/MXN', 'BTC/MXN', ...
  kind text not null default 'fiat',        -- 'fiat' | 'cripto'
  buy_rate numeric(18,8) not null,
  sell_rate numeric(18,8) not null,
  source text not null default 'manual',    -- 'manual' | nombre del proveedor de API
  updated_by uuid references divisas.profiles(id),
  updated_at timestamptz not null default now(),
  unique (pair)
);

create table if not exists divisas.exchange_rate_history (
  id uuid primary key default gen_random_uuid(),
  pair text not null,
  buy_rate_old numeric(18,8),
  buy_rate_new numeric(18,8) not null,
  sell_rate_old numeric(18,8),
  sell_rate_new numeric(18,8) not null,
  source text not null,
  changed_by uuid references divisas.profiles(id),
  changed_at timestamptz not null default now()
);

create index if not exists exchange_rate_history_pair_idx on divisas.exchange_rate_history (pair, changed_at desc);

-- Cada UPDATE a exchange_rates queda registrado automáticamente en el
-- historial — nadie puede "editar en silencio" un tipo de cambio.
create or replace function divisas.log_exchange_rate_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into divisas.exchange_rate_history (
    pair, buy_rate_old, buy_rate_new, sell_rate_old, sell_rate_new, source, changed_by
  ) values (
    new.pair, old.buy_rate, new.buy_rate, old.sell_rate, new.sell_rate, new.source, new.updated_by
  );
  return new;
end;
$$;

drop trigger if exists exchange_rates_audit on divisas.exchange_rates;
create trigger exchange_rates_audit
  after update on divisas.exchange_rates
  for each row
  when (old.buy_rate is distinct from new.buy_rate or old.sell_rate is distinct from new.sell_rate)
  execute function divisas.log_exchange_rate_change();

-- También registra la primera inserción de cada par como entrada inicial del historial.
create or replace function divisas.log_exchange_rate_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into divisas.exchange_rate_history (
    pair, buy_rate_old, buy_rate_new, sell_rate_old, sell_rate_new, source, changed_by
  ) values (
    new.pair, null, new.buy_rate, null, new.sell_rate, new.source, new.updated_by
  );
  return new;
end;
$$;

drop trigger if exists exchange_rates_audit_insert on divisas.exchange_rates;
create trigger exchange_rates_audit_insert
  after insert on divisas.exchange_rates
  for each row execute function divisas.log_exchange_rate_insert();

comment on table divisas.exchange_rates is 'Valor ACTUAL editable por par. No es fuente de verdad histórica — cada operación guarda su propio snapshot al crearse.';
comment on table divisas.exchange_rate_history is 'Log append-only de cada cambio de tipo de cambio: quién, cuándo, de qué valor a qué valor.';
