-- 032: borrado DURO de una operación completa, en los 3 módulos.
--
-- Revierte a propósito la decisión de la migración 015 ("DELETE: nadie,
-- nunca, ni siquiera super_admin — se cancela, no se borra"). El negocio
-- pidió poder borrar operaciones, no solo cancelarlas.
--
-- security definer: la función chequea el rol por su cuenta
-- (super_admin/admin, igual que la edición) y luego borra saltándose la RLS
-- de operations (que sigue sin policy de DELETE — este es el único camino).
--
-- Cascadas: international_transfers / crypto_transactions / cash_transactions,
-- operation_status_history y attachments tienen ON DELETE CASCADE contra
-- operations, así que caen solos. reconciliations.operation_id NO tiene
-- cascade, así que se desata (queda la fila de conciliación, sin operación).

create or replace function divisas.delete_operation(p_operation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not divisas.has_role('super_admin', 'admin') then
    raise exception 'No tienes permiso para borrar operaciones.';
  end if;

  update divisas.reconciliations
     set operation_id = null
   where operation_id = p_operation_id;

  delete from divisas.operations where id = p_operation_id;

  if not found then
    raise exception 'La operación % no existe.', p_operation_id;
  end if;
end;
$$;

grant execute on function divisas.delete_operation(uuid) to authenticated;
