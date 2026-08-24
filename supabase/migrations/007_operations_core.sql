-- 007: tabla cabecera `operations` — común a los 3 módulos (transferencias,
-- cripto, efectivo). Cada módulo extiende esta cabecera con una tabla 1:1
-- propia (international_transfers / crypto_transactions / cash_transactions)
-- que solo tiene sus campos específicos. Los campos financieros resumen
-- (utilidad, ingresos, costos) SIEMPRE se calculan con el motor de cálculo
-- centralizado antes de guardarse aquí — nunca se recalculan después.

create sequence if not exists divisas.operations_folio_seq;

create or replace function divisas.next_folio()
returns text
language sql
as $$
  select 'EA-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('divisas.operations_folio_seq')::text, 6, '0');
$$;

create table if not exists divisas.operations (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique default divisas.next_folio(),
  module divisas.operation_module not null,
  client_id uuid references divisas.clients(id),
  created_by uuid not null references divisas.profiles(id),   -- quién registró la operación
  executed_by uuid references divisas.profiles(id),           -- quién ejecutó la transferencia/operación
  authorized_by uuid references divisas.profiles(id),         -- quién autorizó
  provider_id uuid references divisas.providers(id),
  payment_method text,
  status divisas.operation_status not null default 'cotizacion',
  reference text,
  observations text,

  -- Resumen financiero: salida del motor de cálculo (calc-engine), snapshot al momento de la operación.
  gross_revenue numeric(18,4) not null default 0,
  total_costs numeric(18,4) not null default 0,
  gross_profit numeric(18,4) not null default 0,
  net_profit numeric(18,4) not null default 0,
  margin_percent numeric(9,4) not null default 0,

  is_demo boolean not null default false,   -- datos de prueba — NUNCA true en operaciones reales

  operation_date date not null default current_date,
  operation_time time not null default current_time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists operations_module_idx on divisas.operations (module);
create index if not exists operations_status_idx on divisas.operations (status);
create index if not exists operations_client_idx on divisas.operations (client_id);
create index if not exists operations_created_by_idx on divisas.operations (created_by);
create index if not exists operations_date_idx on divisas.operations (operation_date desc);
create index if not exists operations_reference_idx on divisas.operations (reference);

comment on table divisas.operations is 'Cabecera común a los 3 módulos. folio es el ID legible único de cada operación. Los campos financieros son snapshot calculado, no se recalculan al cambiar reglas/tipos de cambio.';

create table if not exists divisas.operation_status_history (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references divisas.operations(id) on delete cascade,
  from_status divisas.operation_status,
  to_status divisas.operation_status not null,
  changed_by uuid references divisas.profiles(id),
  note text,
  changed_at timestamptz not null default now()
);

create index if not exists operation_status_history_op_idx on divisas.operation_status_history (operation_id, changed_at);

comment on table divisas.operation_status_history is 'Línea de tiempo de estados de cada operación — quién cambió de qué estado a cuál y cuándo.';

-- Log de cambios de estado, automático en cada UPDATE de operations.status.
create or replace function divisas.log_operation_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status then
    insert into divisas.operation_status_history (operation_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists operations_status_history on divisas.operations;
create trigger operations_status_history
  after update on divisas.operations
  for each row execute function divisas.log_operation_status_change();

-- updated_at automático.
create or replace function divisas.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists operations_set_updated_at on divisas.operations;
create trigger operations_set_updated_at
  before update on divisas.operations
  for each row execute function divisas.set_updated_at();

-- Auditoría completa (todos los campos) de cada cambio en operations.
drop trigger if exists operations_audit on divisas.operations;
create trigger operations_audit
  after insert or update or delete on divisas.operations
  for each row execute function divisas.audit_row_change();
