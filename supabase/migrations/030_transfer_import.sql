-- 030: importación de transferencias desde fuentes externas (Excel/CSV que
-- sube un usuario, y —Fase 2— el Google Sheet del equipo que el sistema
-- lee de forma automática).
--
-- Diseño:
--   * El sistema SOLO LEE las fuentes externas. Nunca escribe de vuelta.
--   * Cada fila importada nace por la MISMA vía que una operación normal:
--     la Netlify Function corre el motor de cálculo (calc-engine) y llama
--     a divisas.create_transfer_operation. No hay INSERT directo.
--   * Idempotencia: operations.import_key (UETR de la fila, o un hash de
--     fecha+cliente+monto+beneficiario cuando no hay UETR). Índice único
--     parcial → re-leer la misma fuente no duplica.
--   * La tabla del equipo es un registro operativo/compliance, no una
--     calculadora de margen: trae un solo tipo de cambio y sin comisión.
--     Las filas importadas se guardan con spread 0 (buy_rate = sell_rate);
--     el TC original y el equivalente en MXN quedan como referencia en
--     tc_reference / amount_mxn.

-- ---------- Campos nuevos de international_transfers ----------
-- Todos NULLABLE: solo se llenan en operaciones importadas (o a mano más
-- adelante si se agregan al formulario). No afectan el motor de cálculo.

alter table divisas.international_transfers
  add column if not exists promotor text,
  add column if not exists beneficiary_name text,
  add column if not exists beneficiary_account text,
  add column if not exists beneficiary_bank text,
  add column if not exists beneficiary_swift text,
  add column if not exists intermediary_bank text,
  add column if not exists bank_address text,
  add column if not exists beneficiary_address text,
  add column if not exists beneficiary_tax_id text,
  add column if not exists uetr text,
  add column if not exists tc_reference numeric(18,8),
  add column if not exists amount_mxn numeric(18,4),
  add column if not exists flag_alta text,
  add column if not exists flag_cuenta_con_recursos text,
  add column if not exists flag_factura text,
  add column if not exists flag_pago text;

comment on column divisas.international_transfers.promotor is 'PROMOTOR de la tabla del equipo — quién refirió/gestionó la operación (texto libre, no ligado a divisas.commissioners).';
comment on column divisas.international_transfers.uetr is 'Unique End-to-end Transaction Reference del pago SWIFT. Se usa como llave de deduplicación al importar.';
comment on column divisas.international_transfers.tc_reference is 'Tipo de cambio que traía la fila importada. No genera spread (buy_rate = sell_rate en importaciones); es solo referencia.';
comment on column divisas.international_transfers.amount_mxn is 'Equivalente en MXN de la operación (MONTO USD × TC de la fila). Referencia — la operación se guarda con principal en USD.';

-- ---------- Metadatos de importación en operations ----------

alter table divisas.operations
  add column if not exists import_source text,   -- 'excel' | 'google_sheet' | 'drive_xlsx' | null (alta manual)
  add column if not exists import_key text,
  add column if not exists import_batch_id uuid;

comment on column divisas.operations.import_source is 'De dónde vino la operación si fue importada: excel | google_sheet | drive_xlsx. NULL = alta manual en la app.';
comment on column divisas.operations.import_key is 'Llave estable de la fila de origen (UETR o hash). Única entre operaciones importadas — evita duplicar al re-leer la fuente.';

create unique index if not exists operations_import_key_uidx
  on divisas.operations (import_key)
  where import_key is not null;

-- ---------- Bitácora de importaciones ----------

create table if not exists divisas.import_batches (
  id uuid primary key default gen_random_uuid(),
  source text not null,                       -- 'excel' | 'google_sheet' | 'drive_xlsx'
  file_name text,                             -- nombre del archivo (Excel/CSV) o del Sheet
  sheet_id text,                              -- id del Google Sheet / archivo de Drive, si aplica
  triggered_by uuid references divisas.profiles(id),   -- quién la disparó; NULL = job programado
  is_scheduled boolean not null default false,
  total_rows integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,   -- filas idénticas ya importadas
  error_count integer not null default 0,
  results jsonb not null default '[]'::jsonb, -- [{ row, status: 'created'|'updated'|'skipped'|'error', folio?, message? }]
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

comment on table divisas.import_batches is 'Una fila por cada corrida de importación (subida manual de Excel o lectura automática del Google Sheet/Drive). results guarda el desenlace fila por fila para auditoría.';

create index if not exists import_batches_started_idx on divisas.import_batches (started_at desc);

alter table divisas.import_batches enable row level security;

-- Lectura: cualquier rol activo (para la pantalla "Importaciones").
create policy import_batches_select on divisas.import_batches
  for select to authenticated
  using (divisas.current_role_is_active());

-- Escritura: solo la service role (Netlify Functions). Sin policy de
-- insert/update para `authenticated` → nadie más puede tocarla vía RLS.

grant select on divisas.import_batches to authenticated;
grant select, insert, update on divisas.import_batches to service_role;

-- ---------- create_transfer_operation: acepta fecha e info de importación ----------
-- Reemplaza la versión de 019. Cambios:
--   * operation_date / operation_time desde p_header (para filas históricas
--     importadas); si no vienen, el default en hora de México (migración 024).
--   * import_source / import_key / import_batch_id desde p_header.
--   * los campos nuevos de international_transfers desde p_details.
-- Todo lo demás es idéntico a 019.

create or replace function divisas.create_transfer_operation(p_header jsonb, p_details jsonb)
returns divisas.operations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_op divisas.operations;
begin
  insert into divisas.operations (
    module, client_id, created_by, executed_by, authorized_by, provider_id,
    payment_method, status, reference, observations,
    gross_revenue, total_costs, gross_profit, net_profit, margin_percent, is_demo,
    operation_date, operation_time,
    import_source, import_key, import_batch_id
  ) values (
    'transferencia',
    (p_header->>'client_id')::uuid,
    (p_header->>'created_by')::uuid,
    (p_header->>'executed_by')::uuid,
    (p_header->>'authorized_by')::uuid,
    (p_header->>'provider_id')::uuid,
    p_header->>'payment_method',
    coalesce((p_header->>'status')::divisas.operation_status, 'cotizacion'),
    p_header->>'reference',
    p_header->>'observations',
    (p_header->>'gross_revenue')::numeric,
    (p_header->>'total_costs')::numeric,
    (p_header->>'gross_profit')::numeric,
    (p_header->>'net_profit')::numeric,
    (p_header->>'margin_percent')::numeric,
    coalesce((p_header->>'is_demo')::boolean, false),
    coalesce((p_header->>'operation_date')::date, (now() at time zone 'America/Mexico_City')::date),
    coalesce((p_header->>'operation_time')::time, (now() at time zone 'America/Mexico_City')::time),
    p_header->>'import_source',
    p_header->>'import_key',
    (p_header->>'import_batch_id')::uuid
  ) returning * into v_op;

  insert into divisas.international_transfers (
    operation_id, contact_phone, country_origin, country_destination,
    currency_origin, currency_destination, amount_sent, amount_received,
    exchange_rate_applied, buy_rate, sell_rate,
    commission_fixed, commission_percent, commission_amount,
    provider_cost, bank_cost, additional_cost, spread_revenue,
    expected_amount, actual_amount, amount_difference,
    promotor, beneficiary_name, beneficiary_account, beneficiary_bank,
    beneficiary_swift, intermediary_bank, bank_address, beneficiary_address,
    beneficiary_tax_id, uetr, tc_reference, amount_mxn,
    flag_alta, flag_cuenta_con_recursos, flag_factura, flag_pago
  ) values (
    v_op.id,
    p_details->>'contact_phone',
    p_details->>'country_origin',
    p_details->>'country_destination',
    p_details->>'currency_origin',
    p_details->>'currency_destination',
    (p_details->>'amount_sent')::numeric,
    (p_details->>'amount_received')::numeric,
    (p_details->>'exchange_rate_applied')::numeric,
    (p_details->>'buy_rate')::numeric,
    (p_details->>'sell_rate')::numeric,
    coalesce((p_details->>'commission_fixed')::numeric, 0),
    coalesce((p_details->>'commission_percent')::numeric, 0),
    coalesce((p_details->>'commission_amount')::numeric, 0),
    coalesce((p_details->>'provider_cost')::numeric, 0),
    coalesce((p_details->>'bank_cost')::numeric, 0),
    coalesce((p_details->>'additional_cost')::numeric, 0),
    coalesce((p_details->>'spread_revenue')::numeric, 0),
    (p_details->>'expected_amount')::numeric,
    (p_details->>'actual_amount')::numeric,
    (p_details->>'amount_difference')::numeric,
    p_details->>'promotor',
    p_details->>'beneficiary_name',
    p_details->>'beneficiary_account',
    p_details->>'beneficiary_bank',
    p_details->>'beneficiary_swift',
    p_details->>'intermediary_bank',
    p_details->>'bank_address',
    p_details->>'beneficiary_address',
    p_details->>'beneficiary_tax_id',
    p_details->>'uetr',
    (p_details->>'tc_reference')::numeric,
    (p_details->>'amount_mxn')::numeric,
    p_details->>'flag_alta',
    p_details->>'flag_cuenta_con_recursos',
    p_details->>'flag_factura',
    p_details->>'flag_pago'
  );

  return v_op;
end;
$$;

-- Sin GRANT EXECUTE a `authenticated` a propósito — solo la service role
-- (Netlify Functions) puede invocarla.
