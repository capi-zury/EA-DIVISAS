-- 029: correo del usuario visible en `profiles` + sincronización con auth.users.
--
-- Contexto: la pantalla "Usuarios" solo mostraba `full_name`, y cuando un
-- usuario se crea sin metadata ese nombre termina siendo el propio correo,
-- así que no había forma clara de saber "qué usuario es quién". El correo
-- real vive en `auth.users`, que la API REST no expone al navegador. La
-- solución es replicar el correo en `divisas.profiles` (que sí es
-- consultable con RLS) y mantenerlo sincronizado con triggers.

-- 1. Columna nueva (nullable: el trigger la llena en altas; el backfill la
--    llena para los usuarios que ya existían).
alter table divisas.profiles add column if not exists email text;

comment on column divisas.profiles.email is 'Espejo de auth.users.email — se mantiene sincronizado por los triggers on_auth_user_created / on_auth_user_email_changed. No editar a mano.';

-- 2. Backfill de los perfiles existentes.
update divisas.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and p.email is distinct from u.email;

-- 3. El trigger de alta ahora también guarda el correo.
create or replace function divisas.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into divisas.profiles (id, full_name, email, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email, 'operador');
  return new;
end;
$$;

-- 4. Si el correo cambia en auth.users, se refleja en el perfil.
create or replace function divisas.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update divisas.profiles set email = new.email, updated_at = now() where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function divisas.handle_user_email_change();

-- 5. Auditar los cambios en `profiles`.
--
-- Hasta ahora `profiles` era la única tabla de negocio SIN trigger de
-- auditoría: subir/bajar el rol de un usuario o activar/desactivarlo no
-- dejaba rastro en `audit_logs`. Para un sistema que tiene un rol
-- "auditor" dedicado eso es un hueco. Se crea DESPUÉS del backfill de
-- arriba a propósito, para no generar una fila de auditoría por cada
-- perfil existente al aplicar esta migración.
drop trigger if exists profiles_audit on divisas.profiles;
create trigger profiles_audit
  after insert or update or delete on divisas.profiles
  for each row execute function divisas.audit_row_change();

-- 6. Endurecer la lectura de `profiles`.
--
-- La política anterior (`using (true)`) dejaba que CUALQUIER usuario
-- autenticado leyera la tabla entera vía la API — nombres, roles y ahora
-- también correos de todos. La app solo necesita que:
--   - cada quien lea su propio perfil (lo hace el AuthContext al entrar), y
--   - un super_admin lea todos (pantalla "Usuarios").
-- Las vistas de dashboard que muestran el nombre del operador
-- (v_operator_totals) no se ven afectadas: corren como su dueño, no pasan
-- por esta política.
drop policy if exists profiles_select on divisas.profiles;
create policy profiles_select on divisas.profiles
  for select to authenticated
  using (id = (select auth.uid()) or divisas.has_role('super_admin'));
