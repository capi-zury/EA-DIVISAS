-- 009: módulo Transferencias internacionales — extensión 1:1 de operations.

create table if not exists divisas.international_transfers (
  operation_id uuid primary key references divisas.operations(id) on delete cascade,

  contact_phone text,
  country_origin text not null,
  country_destination text not null,
  currency_origin text not null references divisas.currencies(code),
  currency_destination text not null references divisas.currencies(code),

  amount_sent numeric(18,4) not null,
  amount_received numeric(18,4) not null,

  -- Snapshot de tipos de cambio AL MOMENTO de la operación — inmutable aunque
  -- exchange_rates cambie después.
  exchange_rate_applied numeric(18,8) not null,   -- el usado para calcular amount_received (== sell_rate)
  buy_rate numeric(18,8) not null,                -- costo real de EA Divisas
  sell_rate numeric(18,8) not null,               -- aplicado al cliente

  commission_fixed numeric(18,4) not null default 0,
  commission_percent numeric(9,4) not null default 0,
  commission_amount numeric(18,4) not null default 0,

  provider_cost numeric(18,4) not null default 0,
  bank_cost numeric(18,4) not null default 0,
  additional_cost numeric(18,4) not null default 0,

  spread_revenue numeric(18,4) not null default 0,

  -- Conciliación rápida a nivel operación (el registro formal vive en `reconciliations`).
  expected_amount numeric(18,4),
  actual_amount numeric(18,4),
  amount_difference numeric(18,4)
);

comment on table divisas.international_transfers is 'Campos específicos de transferencias. buy_rate/sell_rate son snapshot — no se recalculan si exchange_rates cambia después.';

drop trigger if exists international_transfers_audit on divisas.international_transfers;
create trigger international_transfers_audit
  after insert or update or delete on divisas.international_transfers
  for each row execute function divisas.audit_row_change();
