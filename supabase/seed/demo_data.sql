-- Datos DEMO — SOLO para desarrollo local. NUNCA correr en producción.
--
-- No vive en supabase/migrations/ a propósito: el runner de migraciones
-- (scripts/migrate.mjs) nunca lo toca. Se ejecuta a mano:
--   node scripts/run-sql.mjs supabase/seed/demo_data.sql
--
-- Requiere al menos un usuario ya registrado (auth.users / divisas.profiles)
-- para usarlo como creador de las operaciones de ejemplo.

do $$
declare
  v_user uuid;
  v_client uuid;
  v_op uuid;
begin
  select id into v_user from divisas.profiles order by created_at limit 1;
  if v_user is null then
    raise notice 'No hay ningún usuario en divisas.profiles todavía — crea uno (regístrate en la app) antes de correr este seed.';
    return;
  end if;

  insert into divisas.clients (name, phone, email, country, responsible_operator_id, notes)
  values ('Cliente Demo — BORRAR', '+52 55 0000 0000', 'demo@ejemplo.com', 'México', v_user, 'DEMO — no es un cliente real')
  returning id into v_client;

  -- Operación demo de efectivo.
  insert into divisas.operations (module, client_id, created_by, executed_by, status, payment_method, is_demo, observations)
  values ('efectivo', v_client, v_user, v_user, 'completada', 'efectivo', true, 'DEMO — no es una operación real')
  returning id into v_op;

  insert into divisas.cash_transactions (operation_id, currency_code, quantity, buy_price, sell_price, spread_per_unit, spread_total)
  values (v_op, 'USD', 1000, 17.80, 18.20, 0.40, 400);

  update divisas.operations
    set gross_revenue = 400, total_costs = 0, gross_profit = 400, net_profit = 400, margin_percent = 2.20
    where id = v_op;

  raise notice 'Seed DEMO insertado (cliente % , operación %).', v_client, v_op;
end $$;
