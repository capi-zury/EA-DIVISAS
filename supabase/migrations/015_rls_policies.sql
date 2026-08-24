-- 015: Row Level Security — todo el schema `divisas`.
--
-- Diseño clave para las tablas de operaciones (operations, international_transfers,
-- crypto_transactions, cash_transactions):
--   - SELECT: cualquier usuario activo autenticado (super_admin/admin/operador/auditor).
--   - INSERT: DENEGADO para todos los roles vía RLS. Crear una operación implica
--     recalcular con el motor de cálculo del lado servidor — eso solo lo hace la
--     Netlify Function con la service role key (que ignora RLS por diseño de
--     Supabase). Así ningún cliente puede insertar una operación con cifras que
--     no pasaron por el motor de cálculo autoritativo.
--   - UPDATE directa: solo super_admin/admin (corrección de operaciones). El
--     cambio de estado normal (lo que puede hacer un operador) pasa por la
--     función divisas.update_operation_status(), que es SECURITY DEFINER y
--     valida la transición y el rol antes de tocar la fila.
--   - DELETE: nadie, nunca, vía RLS. Ni siquiera super_admin. Se cancela, no se borra.
--
-- audit_logs, operation_status_history, exchange_rate_history: solo lectura
-- para roles autorizados; escritura únicamente vía triggers/funciones
-- SECURITY DEFINER (que corren como dueño de la tabla y no pasan por RLS).

create or replace function divisas.has_role(variadic p_roles divisas.user_role[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select divisas.current_role_is_active() and divisas.current_role() = any(p_roles);
$$;

-- ---------- profiles ----------
alter table divisas.profiles enable row level security;

create policy profiles_select on divisas.profiles
  for select to authenticated
  using (true);

create policy profiles_write_super_admin on divisas.profiles
  for all to authenticated
  using (divisas.has_role('super_admin'))
  with check (divisas.has_role('super_admin'));

-- ---------- clients ----------
alter table divisas.clients enable row level security;

create policy clients_select on divisas.clients
  for select to authenticated
  using (divisas.current_role_is_active());

create policy clients_insert on divisas.clients
  for insert to authenticated
  with check (divisas.has_role('super_admin', 'admin', 'operador'));

create policy clients_update on divisas.clients
  for update to authenticated
  using (divisas.has_role('super_admin', 'admin', 'operador'))
  with check (divisas.has_role('super_admin', 'admin', 'operador'));

create policy clients_delete on divisas.clients
  for delete to authenticated
  using (divisas.has_role('super_admin'));

-- ---------- catálogos: currencies, crypto_assets, crypto_networks, providers ----------
alter table divisas.currencies enable row level security;
alter table divisas.crypto_assets enable row level security;
alter table divisas.crypto_networks enable row level security;
alter table divisas.providers enable row level security;

create policy currencies_select on divisas.currencies for select to authenticated using (divisas.current_role_is_active());
create policy currencies_write on divisas.currencies for all to authenticated
  using (divisas.has_role('super_admin', 'admin')) with check (divisas.has_role('super_admin', 'admin'));

create policy crypto_assets_select on divisas.crypto_assets for select to authenticated using (divisas.current_role_is_active());
create policy crypto_assets_write on divisas.crypto_assets for all to authenticated
  using (divisas.has_role('super_admin', 'admin')) with check (divisas.has_role('super_admin', 'admin'));

create policy crypto_networks_select on divisas.crypto_networks for select to authenticated using (divisas.current_role_is_active());
create policy crypto_networks_write on divisas.crypto_networks for all to authenticated
  using (divisas.has_role('super_admin', 'admin')) with check (divisas.has_role('super_admin', 'admin'));

create policy providers_select on divisas.providers for select to authenticated using (divisas.current_role_is_active());
create policy providers_write on divisas.providers for all to authenticated
  using (divisas.has_role('super_admin', 'admin')) with check (divisas.has_role('super_admin', 'admin'));

-- ---------- wallets ----------
alter table divisas.wallets enable row level security;

create policy wallets_select on divisas.wallets for select to authenticated using (divisas.current_role_is_active());
create policy wallets_insert on divisas.wallets for insert to authenticated
  with check (divisas.has_role('super_admin', 'admin', 'operador'));
create policy wallets_update on divisas.wallets for update to authenticated
  using (divisas.has_role('super_admin', 'admin')) with check (divisas.has_role('super_admin', 'admin'));
create policy wallets_delete on divisas.wallets for delete to authenticated
  using (divisas.has_role('super_admin', 'admin'));

-- ---------- exchange_rates ----------
alter table divisas.exchange_rates enable row level security;

create policy exchange_rates_select on divisas.exchange_rates for select to authenticated using (divisas.current_role_is_active());
create policy exchange_rates_write on divisas.exchange_rates for insert to authenticated
  with check (divisas.has_role('super_admin', 'admin'));
create policy exchange_rates_update on divisas.exchange_rates for update to authenticated
  using (divisas.has_role('super_admin', 'admin')) with check (divisas.has_role('super_admin', 'admin'));
-- sin policy de delete → nadie puede borrar un tipo de cambio.

alter table divisas.exchange_rate_history enable row level security;
create policy exchange_rate_history_select on divisas.exchange_rate_history for select to authenticated using (divisas.current_role_is_active());
-- sin insert/update/delete policy → solo el trigger (dueño de tabla) escribe aquí.

-- ---------- commission_rules, fees ----------
alter table divisas.commission_rules enable row level security;
alter table divisas.fees enable row level security;

create policy commission_rules_select on divisas.commission_rules for select to authenticated using (divisas.current_role_is_active());
create policy commission_rules_write on divisas.commission_rules for all to authenticated
  using (divisas.has_role('super_admin', 'admin')) with check (divisas.has_role('super_admin', 'admin'));

create policy fees_select on divisas.fees for select to authenticated using (divisas.current_role_is_active());
create policy fees_write on divisas.fees for all to authenticated
  using (divisas.has_role('super_admin', 'admin')) with check (divisas.has_role('super_admin', 'admin'));

-- ---------- operations + módulos (transferencias / cripto / efectivo) ----------
alter table divisas.operations enable row level security;
alter table divisas.international_transfers enable row level security;
alter table divisas.crypto_transactions enable row level security;
alter table divisas.cash_transactions enable row level security;
alter table divisas.operation_status_history enable row level security;

create policy operations_select on divisas.operations for select to authenticated using (divisas.current_role_is_active());
create policy operations_update_admin on divisas.operations for update to authenticated
  using (divisas.has_role('super_admin', 'admin')) with check (divisas.has_role('super_admin', 'admin'));
-- sin insert/delete policy → inserciones solo vía Netlify Function (service role); nadie borra.

create policy international_transfers_select on divisas.international_transfers for select to authenticated using (divisas.current_role_is_active());
create policy international_transfers_update_admin on divisas.international_transfers for update to authenticated
  using (divisas.has_role('super_admin', 'admin')) with check (divisas.has_role('super_admin', 'admin'));

create policy crypto_transactions_select on divisas.crypto_transactions for select to authenticated using (divisas.current_role_is_active());
create policy crypto_transactions_update_admin on divisas.crypto_transactions for update to authenticated
  using (divisas.has_role('super_admin', 'admin')) with check (divisas.has_role('super_admin', 'admin'));

create policy cash_transactions_select on divisas.cash_transactions for select to authenticated using (divisas.current_role_is_active());
create policy cash_transactions_update_admin on divisas.cash_transactions for update to authenticated
  using (divisas.has_role('super_admin', 'admin')) with check (divisas.has_role('super_admin', 'admin'));

create policy operation_status_history_select on divisas.operation_status_history for select to authenticated using (divisas.current_role_is_active());
-- sin insert/update/delete policy → solo el trigger escribe aquí.

-- ---------- reconciliations ----------
alter table divisas.reconciliations enable row level security;

create policy reconciliations_select on divisas.reconciliations for select to authenticated using (divisas.current_role_is_active());
create policy reconciliations_insert on divisas.reconciliations for insert to authenticated
  with check (divisas.has_role('super_admin', 'admin', 'operador'));
create policy reconciliations_update on divisas.reconciliations for update to authenticated
  using (divisas.has_role('super_admin', 'admin')) with check (divisas.has_role('super_admin', 'admin'));

-- ---------- attachments ----------
alter table divisas.attachments enable row level security;

create policy attachments_select on divisas.attachments for select to authenticated using (divisas.current_role_is_active());
create policy attachments_insert on divisas.attachments for insert to authenticated
  with check (divisas.has_role('super_admin', 'admin', 'operador'));
create policy attachments_delete on divisas.attachments for delete to authenticated
  using (divisas.has_role('super_admin'));

-- ---------- audit_logs: solo lectura para super_admin/admin/auditor, escritura nunca vía RLS ----------
alter table divisas.audit_logs enable row level security;

create policy audit_logs_select on divisas.audit_logs for select to authenticated
  using (divisas.has_role('super_admin', 'admin', 'auditor'));
-- sin insert/update/delete policy → append-only real, ni siquiera super_admin puede tocarlo desde la app.
