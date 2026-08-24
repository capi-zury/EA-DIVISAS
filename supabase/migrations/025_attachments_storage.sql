-- 025: bucket de Supabase Storage para comprobantes + políticas.
--
-- El bucket es PRIVADO (public: false) — los archivos solo se pueden leer
-- con una URL firmada (signed URL) generada por el backend/cliente
-- autenticado, nunca por URL pública directa. Los permisos de
-- storage.objects reflejan exactamente los mismos roles que
-- divisas.attachments (015_rls_policies.sql): cualquier activo puede leer,
-- super_admin/admin/operador puede subir, solo super_admin puede borrar.

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 15728640) -- 15 MB por archivo
on conflict (id) do nothing;

create policy attachments_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and divisas.current_role_is_active());

create policy attachments_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and divisas.has_role('super_admin', 'admin', 'operador'));

create policy attachments_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and divisas.has_role('super_admin'));
