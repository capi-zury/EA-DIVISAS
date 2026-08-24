-- EA Divisas — Operations
-- 001: schema propio + tipos enumerados.
--
-- Todo el sistema vive en el schema `divisas`, separado de `public` a
-- propósito: en este mismo proyecto Supabase existe `public.operations`
-- (herramienta personal de control de comisiones de cripto, anterior a este
-- sistema). Usar un schema distinto garantiza cero colisión y cero riesgo
-- de tocar esa tabla por accidente.

create schema if not exists divisas;

-- Roles de usuario del sistema.
do $$ begin
  create type divisas.user_role as enum ('super_admin', 'admin', 'operador', 'auditor');
exception when duplicate_object then null; end $$;

-- Módulo al que pertenece una operación.
do $$ begin
  create type divisas.operation_module as enum ('transferencia', 'cripto', 'efectivo');
exception when duplicate_object then null; end $$;

-- Estados de una operación — compartidos por los 3 módulos.
do $$ begin
  create type divisas.operation_status as enum (
    'cotizacion',
    'pendiente',
    'en_proceso',
    'enviada',
    'completada',
    'cancelada',
    'reembolsada',
    'con_incidencia'
  );
exception when duplicate_object then null; end $$;

-- Estado de conciliación (esperado vs. real).
do $$ begin
  create type divisas.reconciliation_status as enum ('conciliado', 'diferencia', 'pendiente_revision');
exception when duplicate_object then null; end $$;

-- Tipo de comisión configurable (fija, porcentual, o ambas).
do $$ begin
  create type divisas.commission_kind as enum ('fija', 'porcentual', 'mixta');
exception when duplicate_object then null; end $$;
