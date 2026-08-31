-- 031: create_cash_operation ahora acepta fecha e info de importación en
-- p_header, igual que create_transfer_operation (migración 030). Sin esto,
-- una operación de efectivo importada tomaba la fecha de HOY y no se podía
-- identificar como importada ni deduplicar.
--
-- create or replace sobre la versión de 028 — mismo nombre y firma, solo se
-- agregan columnas al insert de divisas.operations.

create or replace function divisas.create_cash_operation(p_header jsonb, p_details jsonb)
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
    'efectivo',
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

  insert into divisas.cash_transactions (
    operation_id, currency_code, denomination, quantity,
    buy_price, sell_price, exchange_rate_reference,
    commission_fixed, commission_percent, commission_amount,
    spread_per_unit, spread_total,
    provider_id, provider_commission_percent, provider_commission_amount
  ) values (
    v_op.id,
    p_details->>'currency_code',
    p_details->>'denomination',
    (p_details->>'quantity')::numeric,
    (p_details->>'buy_price')::numeric,
    (p_details->>'sell_price')::numeric,
    (p_details->>'exchange_rate_reference')::numeric,
    coalesce((p_details->>'commission_fixed')::numeric, 0),
    coalesce((p_details->>'commission_percent')::numeric, 0),
    coalesce((p_details->>'commission_amount')::numeric, 0),
    coalesce((p_details->>'spread_per_unit')::numeric, 0),
    coalesce((p_details->>'spread_total')::numeric, 0),
    (p_details->>'provider_id')::uuid,
    coalesce((p_details->>'provider_commission_percent')::numeric, 0),
    coalesce((p_details->>'provider_commission_amount')::numeric, 0)
  );

  return v_op;
end;
$$;
