-- 003: perfiles de usuario (extiende auth.users de Supabase — no reinventamos
-- una tabla de passwords) y clientes.

create table if not exists divisas.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role divisas.user_role not null default 'operador',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table divisas.profiles is 'Un perfil por usuario de auth.users. El rol vive aquí y es lo que consultan las políticas RLS de todo el sistema.';

-- Autocompleta un perfil cuando se crea un usuario en auth.users (vía Supabase Auth).
-- El rol por defecto es 'operador'; un super_admin debe subirlo manualmente después.
create or replace function divisas.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into divisas.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'operador');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function divisas.handle_new_user();

-- Helper usado por TODAS las políticas RLS del schema `divisas`.
-- security definer + search_path fijo: evita que RLS de profiles se
-- autobloquee al consultarse a sí misma, y evita hijacking de search_path.
create or replace function divisas.current_role()
returns divisas.user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from divisas.profiles where id = auth.uid();
$$;

create or replace function divisas.current_role_is_active()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select active from divisas.profiles where id = auth.uid()), false);
$$;

create table if not exists divisas.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  country text,
  internal_reference text,             -- identificación/referencia interna
  responsible_operator_id uuid references divisas.profiles(id),
  status text not null default 'activo',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clients_name_idx on divisas.clients using gin (to_tsvector('spanish', name));
create index if not exists clients_phone_idx on divisas.clients (phone);

comment on table divisas.clients is 'Clientes de EA Divisas. El perfil de cliente se arma agregando sus operaciones (ver vista divisas.client_summary).';
