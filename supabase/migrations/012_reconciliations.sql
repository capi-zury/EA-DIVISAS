-- 012: Conciliación — comparar esperado vs. real y marcar diferencias.
-- Puede atarse a una operación puntual o a un corte general (ej. corte de
-- caja de efectivo del día) — por eso operation_id es opcional.

create table if not exists divisas.reconciliations (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid references divisas.operations(id),
  context text not null,                -- 'operación EA-2026-000123' | 'corte de caja USD 2026-08-24' | ...
  currency_code text references divisas.currencies(code),
  expected_amount numeric(18,4) not null,
  actual_amount numeric(18,4) not null,
  difference numeric(18,4) not null generated always as (actual_amount - expected_amount) stored,
  status divisas.reconciliation_status not null default 'pendiente_revision',
  reviewed_by uuid references divisas.profiles(id),
  note text,
  created_by uuid not null references divisas.profiles(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists reconciliations_operation_idx on divisas.reconciliations (operation_id);
create index if not exists reconciliations_status_idx on divisas.reconciliations (status);

comment on table divisas.reconciliations is 'Esperado vs. real. difference se calcula en la propia columna (generated) para que nunca se desincronice.';

drop trigger if exists reconciliations_audit on divisas.reconciliations;
create trigger reconciliations_audit
  after insert or update or delete on divisas.reconciliations
  for each row execute function divisas.audit_row_change();
