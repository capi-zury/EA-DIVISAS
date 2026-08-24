-- 014: vistas de agregación para dashboard/reportes.
--
-- Todas excluyen is_demo = true (los datos de prueba nunca deben mezclarse
-- con reportes reales) y solo cuentan utilidad de operaciones en un estado
-- "real" (ver divisas.is_profit_counted) — canceladas/reembolsadas quedan
-- registradas pero no suman a la utilidad de la empresa.
--
-- Espejo en TypeScript: src/lib/domain/operation-status.ts → isProfitCounted().
-- Si cambias el criterio aquí, cámbialo también allá (y viceversa).

create or replace function divisas.is_profit_counted(p_status divisas.operation_status)
returns boolean
language sql
immutable
as $$
  select p_status in ('completada', 'enviada', 'en_proceso', 'con_incidencia');
$$;

create or replace view divisas.client_summary as
select
  c.id as client_id,
  c.name,
  c.phone,
  c.email,
  c.country,
  count(o.id) filter (where o.is_demo = false) as total_operations,
  coalesce(sum(o.gross_revenue) filter (where o.is_demo = false and divisas.is_profit_counted(o.status)), 0) as total_commissions,
  coalesce(sum(o.net_profit) filter (where o.is_demo = false and divisas.is_profit_counted(o.status)), 0) as total_profit,
  max(o.created_at) as last_operation_at
from divisas.clients c
left join divisas.operations o on o.client_id = c.id
group by c.id, c.name, c.phone, c.email, c.country;

create or replace view divisas.v_daily_totals as
select
  o.operation_date,
  count(*) as operations_count,
  coalesce(sum(o.gross_revenue), 0) as gross_revenue,
  coalesce(sum(o.total_costs), 0) as total_costs,
  coalesce(sum(o.net_profit), 0) as net_profit
from divisas.operations o
where o.is_demo = false and divisas.is_profit_counted(o.status)
group by o.operation_date;

create or replace view divisas.v_module_totals as
select
  o.module,
  o.operation_date,
  count(*) as operations_count,
  coalesce(sum(o.gross_revenue), 0) as gross_revenue,
  coalesce(sum(o.net_profit), 0) as net_profit,
  coalesce(avg(o.margin_percent), 0) as avg_margin_percent
from divisas.operations o
where o.is_demo = false and divisas.is_profit_counted(o.status)
group by o.module, o.operation_date;

create or replace view divisas.v_operator_totals as
select
  o.created_by as operator_id,
  p.full_name as operator_name,
  o.operation_date,
  count(*) as operations_count,
  coalesce(sum(o.net_profit), 0) as net_profit
from divisas.operations o
join divisas.profiles p on p.id = o.created_by
where o.is_demo = false and divisas.is_profit_counted(o.status)
group by o.created_by, p.full_name, o.operation_date;
