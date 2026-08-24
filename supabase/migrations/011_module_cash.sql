-- 011: módulo Efectivo/Dólares — extensión 1:1 de operations.

create table if not exists divisas.cash_transactions (
  operation_id uuid primary key references divisas.operations(id) on delete cascade,

  currency_code text not null references divisas.currencies(code),
  denomination text,                    -- ej. "billetes 100", "monedas" — opcional, informativo
  quantity numeric(18,4) not null,

  buy_price numeric(18,8) not null,
  sell_price numeric(18,8) not null,
  exchange_rate_reference numeric(18,8),

  commission_fixed numeric(18,4) not null default 0,
  commission_percent numeric(9,4) not null default 0,
  commission_amount numeric(18,4) not null default 0,

  spread_per_unit numeric(18,8) not null default 0,
  spread_total numeric(18,4) not null default 0
);

comment on table divisas.cash_transactions is 'Campos específicos de efectivo. spread = precio_venta - precio_compra, snapshot de esa operación.';

drop trigger if exists cash_transactions_audit on divisas.cash_transactions;
create trigger cash_transactions_audit
  after insert or update or delete on divisas.cash_transactions
  for each row execute function divisas.audit_row_change();
