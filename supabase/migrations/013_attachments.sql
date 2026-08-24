-- 013: comprobantes adjuntos a una operación (archivo vive en Supabase
-- Storage; aquí solo el metadato + la ruta).

create table if not exists divisas.attachments (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references divisas.operations(id) on delete cascade,
  file_path text not null,              -- ruta dentro del bucket de Storage
  file_name text not null,
  file_type text,
  file_size_bytes bigint,
  uploaded_by uuid references divisas.profiles(id),
  uploaded_at timestamptz not null default now()
);

create index if not exists attachments_operation_idx on divisas.attachments (operation_id);

comment on table divisas.attachments is 'Comprobantes de una operación. El archivo binario vive en Supabase Storage (bucket "attachments"); aquí solo el metadato.';

drop trigger if exists attachments_audit on divisas.attachments;
create trigger attachments_audit
  after insert or update or delete on divisas.attachments
  for each row execute function divisas.audit_row_change();
