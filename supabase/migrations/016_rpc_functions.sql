-- 016: funciones RPC — únicas vías controladas para acciones que RLS por sí
-- sola no puede expresar bien (transición de estado válida, auto-edición
-- de perfil sin poder tocar el propio rol).

-- Transiciones válidas — MISMA tabla que src/lib/domain/operation-status.ts
-- (ALLOWED_TRANSITIONS). Si cambias una, cambia la otra.
create or replace function divisas.is_valid_transition(p_from divisas.operation_status, p_to divisas.operation_status)
returns boolean
language sql
immutable
as $$
  select case p_from
    when 'cotizacion'     then p_to in ('pendiente', 'cancelada')
    when 'pendiente'      then p_to in ('en_proceso', 'cancelada')
    when 'en_proceso'     then p_to in ('enviada', 'con_incidencia', 'cancelada')
    when 'enviada'        then p_to in ('completada', 'con_incidencia')
    when 'completada'     then p_to in ('reembolsada', 'con_incidencia')
    when 'cancelada'      then false
    when 'reembolsada'    then false
    when 'con_incidencia' then p_to in ('en_proceso', 'completada', 'cancelada')
    else false
  end;
$$;

create or replace function divisas.update_operation_status(
  p_operation_id uuid,
  p_new_status divisas.operation_status,
  p_note text default null
)
returns divisas.operations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role divisas.user_role := divisas.current_role();
  v_op divisas.operations;
begin
  if not divisas.current_role_is_active() then
    raise exception 'Usuario inactivo o sin perfil.';
  end if;

  if v_role not in ('super_admin', 'admin', 'operador') then
    raise exception 'Rol % no puede cambiar el estado de una operación.', v_role;
  end if;

  select * into v_op from divisas.operations where id = p_operation_id for update;
  if not found then
    raise exception 'Operación % no existe.', p_operation_id;
  end if;

  if not divisas.is_valid_transition(v_op.status, p_new_status) then
    raise exception 'Transición inválida: % → %.', v_op.status, p_new_status;
  end if;

  -- Cancelar o reembolsar es una decisión administrativa, no de operador.
  if p_new_status in ('cancelada', 'reembolsada') and v_role = 'operador' then
    raise exception 'Solo administradores pueden cancelar o reembolsar una operación.';
  end if;

  update divisas.operations
    set status = p_new_status,
        observations = case when p_note is not null then coalesce(observations || E'\n', '') || p_note else observations end
    where id = p_operation_id
    returning * into v_op;

  return v_op;
end;
$$;

grant execute on function divisas.update_operation_status(uuid, divisas.operation_status, text) to authenticated;

-- Un usuario puede editar su propio nombre visible, pero jamás su propio rol/estado activo.
create or replace function divisas.update_my_profile(p_full_name text)
returns divisas.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile divisas.profiles;
begin
  update divisas.profiles set full_name = p_full_name, updated_at = now()
    where id = auth.uid()
    returning * into v_profile;
  if not found then
    raise exception 'Perfil no encontrado.';
  end if;
  return v_profile;
end;
$$;

grant execute on function divisas.update_my_profile(text) to authenticated;
