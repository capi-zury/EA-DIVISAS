-- 028: create_cash_operation / update_cash_operation con los nuevos campos
-- de reparto de proveedor (027). create or replace sobre las funciones de
-- 019 y 026 — mismo nombre y firma, solo se agregan columnas al insert/update.

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
    gross_revenue, total_costs, gross_profit, net_profit, margin_percent, is_demo
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
    coalesce((p_header->>'is_demo')::boolean, false)
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

create or replace function divisas.update_cash_operation(p_operation_id uuid, p_header jsonb, p_details jsonb)
returns divisas.operations
language plpgsql
as $$
declare
  v_op divisas.operations;
begin
  update divisas.operations set
    client_id = coalesce((p_header->>'client_id')::uuid, client_id),
    payment_method = p_header->>'payment_method',
    reference = p_header->>'reference',
    observations = p_header->>'observations',
    gross_revenue = (p_header->>'gross_revenue')::numeric,
    total_costs = (p_header->>'total_costs')::numeric,
    gross_profit = (p_header->>'gross_profit')::numeric,
    net_profit = (p_header->>'net_profit')::numeric,
    margin_percent = (p_header->>'margin_percent')::numeric
  where id = p_operation_id
  returning * into v_op;

  if not found then
    raise exception 'Operación % no existe o no tienes permiso para editarla.', p_operation_id;
  end if;

  update divisas.cash_transactions set
    currency_code = p_details->>'currency_code',
    denomination = p_details->>'denomination',
    quantity = (p_details->>'quantity')::numeric,
    buy_price = (p_details->>'buy_price')::numeric,
    sell_price = (p_details->>'sell_price')::numeric,
    commission_fixed = coalesce((p_details->>'commission_fixed')::numeric, 0),
    commission_percent = coalesce((p_details->>'commission_percent')::numeric, 0),
    commission_amount = coalesce((p_details->>'commission_amount')::numeric, 0),
    spread_per_unit = coalesce((p_details->>'spread_per_unit')::numeric, 0),
    spread_total = coalesce((p_details->>'spread_total')::numeric, 0),
    provider_id = (p_details->>'provider_id')::uuid,
    provider_commission_percent = coalesce((p_details->>'provider_commission_percent')::numeric, 0),
    provider_commission_amount = coalesce((p_details->>'provider_commission_amount')::numeric, 0)
  where operation_id = p_operation_id;

  return v_op;
end;
$$;

grant execute on function divisas.create_cash_operation(jsonb, jsonb) to service_role;
grant execute on function divisas.update_cash_operation(uuid, jsonb, jsonb) to authenticated;
