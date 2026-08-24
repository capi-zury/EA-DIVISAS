-- 027: reparto de comisión con proveedor en operaciones de efectivo.
-- provider_id es opcional — si queda vacío (o su % en 0), el 100% de la
-- comisión cobrada es ganancia de EA Divisas (comportamiento actual, sin
-- cambios). Mismo patrón que ya existe en transferencias (provider_cost) y
-- cripto (provider_fee_buy/sell): el costo/reparto de proveedor siempre
-- separado de lo que gana la empresa.

alter table divisas.cash_transactions
  add column if not exists provider_id uuid references divisas.providers(id),
  add column if not exists provider_commission_percent numeric(9,4) not null default 0,
  add column if not exists provider_commission_amount numeric(18,4) not null default 0;

comment on column divisas.cash_transactions.provider_commission_percent is '% de la comisión cobrada que se lleva el proveedor. 0 o sin proveedor = 100% para EA Divisas.';
