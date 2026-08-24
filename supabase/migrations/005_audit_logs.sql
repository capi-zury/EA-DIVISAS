-- 005: Audit Log — tabla central de auditoría.
-- "Nunca eliminar silenciosamente información importante": esta tabla es
-- append-only (sin UPDATE/DELETE permitido para nadie, ni siquiera
-- super_admin — ver políticas RLS en 014). Cualquier cambio sensible en el
-- sistema queda escrito aquí con quién, cuándo, y valor anterior/nuevo.

create table if not exists divisas.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references divisas.profiles(id),
  actor_role divisas.user_role,
  action text not null,               -- 'insert' | 'update' | 'delete' | 'status_change' | 'login' | ...
  table_name text not null,
  record_id uuid,
  old_value jsonb,
  new_value jsonb,
  description text,                   -- frase legible: "Zury modificó el tipo de cambio de 17.85 a 17.92"
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_table_record_idx on divisas.audit_logs (table_name, record_id);
create index if not exists audit_logs_actor_idx on divisas.audit_logs (actor_id);
create index if not exists audit_logs_created_idx on divisas.audit_logs (created_at desc);

comment on table divisas.audit_logs is 'Bitácora de auditoría, append-only. Nadie puede editar ni borrar un registro de aquí, ni siquiera super_admin.';

-- Trigger genérico reutilizable: cualquier tabla que lo use queda auditada
-- automáticamente en INSERT/UPDATE/DELETE, sin duplicar lógica por tabla.
create or replace function divisas.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role divisas.user_role := divisas.current_role();
  v_action text;
  v_record_id uuid;
  v_old jsonb;
  v_new jsonb;
begin
  if tg_op = 'INSERT' then
    v_action := 'insert';
    v_new := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    v_action := 'update';
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
  elsif tg_op = 'DELETE' then
    v_action := 'delete';
    v_old := to_jsonb(old);
  end if;

  -- No todas las tablas auditadas tienen columna `id` (ej. international_transfers
  -- usa operation_id como PK) — se toma la que exista, en ese orden.
  v_record_id := coalesce(
    nullif(coalesce(v_new, v_old)->>'id', ''),
    nullif(coalesce(v_new, v_old)->>'operation_id', '')
  )::uuid;

  insert into divisas.audit_logs (actor_id, actor_role, action, table_name, record_id, old_value, new_value)
  values (v_actor, v_role, v_action, tg_table_name, v_record_id, v_old, v_new);

  return coalesce(new, old);
end;
$$;
