-- 017: privilegios SQL base para el rol `authenticated`.
--
-- GRANT y RLS son capas distintas: sin GRANT, Postgres deniega el acceso
-- antes de siquiera evaluar las políticas RLS. Aquí se abre el privilegio
-- amplio a nivel tabla; RLS (015) es la que realmente decide fila por fila
-- y columna de operación qué puede hacer cada rol.
--
-- `service_role` (usado solo desde las Netlify Functions, nunca en el
-- navegador) ya tiene acceso total por diseño de Supabase — no necesita
-- grants explícitos aquí.

grant usage on schema divisas to authenticated, anon;

grant select, insert, update on all tables in schema divisas to authenticated;
grant delete on divisas.clients, divisas.wallets, divisas.attachments to authenticated;

grant usage, select on all sequences in schema divisas to authenticated;

grant execute on all functions in schema divisas to authenticated;

-- Las vistas de dashboard heredan el GRANT SELECT de la línea de arriba
-- (son objetos de la misma lista "all tables in schema"), así que no
-- necesitan una línea aparte.

-- `anon` (visitante sin sesión) no debe leer nada de este schema — solo
-- necesita el USAGE del schema para que Supabase no rompa al listar la API;
-- RLS ya bloquea todo lo demás porque ninguna policy incluye `to anon`.
