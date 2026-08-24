-- 023: comisionistas — quién refiere/gestiona a cada cliente, y a qué
-- categoría de negocio pertenece el cliente (cripto/efectivo/transferencia).
-- Reutiliza divisas.operation_module para la categoría en vez de crear un
-- enum nuevo — es exactamente el mismo dominio (los 3 módulos de la app).

create table if not exists divisas.commissioners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table divisas.clients
  add column if not exists commissioner_id uuid references divisas.commissioners(id),
  add column if not exists primary_module divisas.operation_module;

comment on table divisas.commissioners is 'Comisionistas — personas que refieren o gestionan clientes y ganan comisión por su actividad.';
comment on column divisas.clients.commissioner_id is 'Quién trajo/gestiona a este cliente.';
comment on column divisas.clients.primary_module is 'A qué categoría de negocio pertenece principalmente el cliente: transferencia, cripto o efectivo.';

alter table divisas.commissioners enable row level security;

create policy commissioners_select on divisas.commissioners for select to authenticated using (divisas.current_role_is_active());
create policy commissioners_insert on divisas.commissioners for insert to authenticated
  with check (divisas.has_role('super_admin', 'admin', 'operador'));
create policy commissioners_update on divisas.commissioners for update to authenticated
  using (divisas.has_role('super_admin', 'admin', 'operador')) with check (divisas.has_role('super_admin', 'admin', 'operador'));
create policy commissioners_delete on divisas.commissioners for delete to authenticated
  using (divisas.has_role('super_admin'));

drop trigger if exists commissioners_audit on divisas.commissioners;
create trigger commissioners_audit
  after insert or update or delete on divisas.commissioners
  for each row execute function divisas.audit_row_change();

grant select, insert, update, delete on divisas.commissioners to authenticated;
grant select, insert, update, delete on divisas.commissioners to service_role;

-- Cuánto trajo cada comisionista — se desprende directo de la relación,
-- mismo criterio de is_profit_counted/is_demo que client_summary.
create or replace view divisas.commissioner_summary as
select
  co.id as commissioner_id,
  co.name,
  co.phone,
  count(distinct c.id) as total_clients,
  count(o.id) filter (where o.is_demo = false) as total_operations,
  coalesce(sum(o.net_profit) filter (where o.is_demo = false and divisas.is_profit_counted(o.status)), 0) as total_profit
from divisas.commissioners co
left join divisas.clients c on c.commissioner_id = co.id
left join divisas.operations o on o.client_id = c.id
group by co.id, co.name, co.phone;
