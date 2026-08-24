-- 020: privilegios para `service_role` (usado solo por Netlify Functions)
-- y bloqueo explícito de las funciones de escritura de operaciones.
--
-- Ojo: a diferencia de lo que uno esperaría, `service_role` NO tiene acceso
-- automático a un schema creado a mano (`divisas`) — Supabase solo le da
-- privilegios amplios por defecto sobre `public`. Hay que otorgarlos aquí
-- explícitamente. (Verificado con has_schema_privilege antes de escribir
-- esta migración.)
--
-- Y por defecto, Postgres otorga EXECUTE a PUBLIC (= todos los roles,
-- incluido `authenticated`) en cualquier función nueva — hay que revocarlo
-- explícitamente en las funciones que crean operaciones, o cualquier
-- usuario autenticado podría invocarlas saltándose el motor de cálculo.

grant usage on schema divisas to service_role;
grant select, insert, update, delete on all tables in schema divisas to service_role;
grant usage, select on all sequences in schema divisas to service_role;
grant execute on all functions in schema divisas to service_role;

alter default privileges in schema divisas grant select, insert, update, delete on tables to service_role;
alter default privileges in schema divisas grant execute on functions to service_role;

revoke execute on function divisas.create_transfer_operation(jsonb, jsonb) from public;
revoke execute on function divisas.create_crypto_operation(jsonb, jsonb) from public;
revoke execute on function divisas.create_cash_operation(jsonb, jsonb) from public;

grant execute on function divisas.create_transfer_operation(jsonb, jsonb) to service_role;
grant execute on function divisas.create_crypto_operation(jsonb, jsonb) to service_role;
grant execute on function divisas.create_cash_operation(jsonb, jsonb) to service_role;
