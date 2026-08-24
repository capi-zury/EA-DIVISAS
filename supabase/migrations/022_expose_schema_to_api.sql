-- 022: expone el schema `divisas` a la API REST de Supabase (PostgREST).
-- Por defecto PostgREST solo expone `public` — sin esto, cualquier llamada
-- desde supabase-js con .schema('divisas') falla con "Invalid schema".
-- Esto es el equivalente en SQL al ajuste de Project Settings → API →
-- "Exposed schemas" del dashboard.

alter role authenticator set pgrst.db_schemas = 'public, divisas';
notify pgrst, 'reload config';
