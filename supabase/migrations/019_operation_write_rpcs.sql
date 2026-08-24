-- 019: funciones de escritura para crear una operación completa (cabecera +
-- detalle de módulo) en una sola transacción.
--
-- A propósito NO se les da GRANT EXECUTE a `authenticated`: la única forma
-- de llamarlas es con la service role key, es decir, únicamente desde las
-- Netlify Functions. Esas funciones son las que corren el motor de cálculo
-- (src/lib/calc-engine, TypeScript) y ya verificaron el rol del usuario
-- antes de llegar aquí — estas funciones SQL solo persisten, nunca calculan
-- ni deciden permisos por su cuenta.

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
    gross_revenue, total_costs, gross_profit, net_profit, margin_percent, is_demo
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
    coalesce((p_header->>'is_demo')::boolean, false)
  ) returning * into v_op;

  insert into divisas.international_transfers (
    operation_id, contact_phone, country_origin, country_destination,
    currency_origin, currency_destination, amount_sent, amount_received,
    exchange_rate_applied, buy_rate, sell_rate,
    commission_fixed, commission_percent, commission_amount,
    provider_cost, bank_cost, additional_cost, spread_revenue,
    expected_amount, actual_amount, amount_difference
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
    (p_details->>'amount_difference')::numeric
  );

  return v_op;
end;
$$;

create or replace function divisas.create_crypto_operation(p_header jsonb, p_details jsonb)
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
    'cripto',
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

  insert into divisas.crypto_transactions (
    operation_id, crypto_asset_code, crypto_network_id, tx_hash,
    wallet_origin_address, wallet_destination_address, wallet_origin_id, wallet_destination_id,
    quantity, market_price, buy_price, sell_price, fx_rate_mxn_usd,
    provider_fee_buy, provider_fee_sell, network_fee,
    customer_fee_fixed, customer_fee_percent, customer_fee_amount,
    spread_buy, spread_sell, acquisition_cost, total_revenue
  ) values (
    v_op.id,
    p_details->>'crypto_asset_code',
    (p_details->>'crypto_network_id')::uuid,
    p_details->>'tx_hash',
    p_details->>'wallet_origin_address',
    p_details->>'wallet_destination_address',
    (p_details->>'wallet_origin_id')::uuid,
    (p_details->>'wallet_destination_id')::uuid,
    (p_details->>'quantity')::numeric,
    (p_details->>'market_price')::numeric,
    (p_details->>'buy_price')::numeric,
    (p_details->>'sell_price')::numeric,
    (p_details->>'fx_rate_mxn_usd')::numeric,
    coalesce((p_details->>'provider_fee_buy')::numeric, 0),
    coalesce((p_details->>'provider_fee_sell')::numeric, 0),
    coalesce((p_details->>'network_fee')::numeric, 0),
    coalesce((p_details->>'customer_fee_fixed')::numeric, 0),
    coalesce((p_details->>'customer_fee_percent')::numeric, 0),
    coalesce((p_details->>'customer_fee_amount')::numeric, 0),
    coalesce((p_details->>'spread_buy')::numeric, 0),
    coalesce((p_details->>'spread_sell')::numeric, 0),
    coalesce((p_details->>'acquisition_cost')::numeric, 0),
    coalesce((p_details->>'total_revenue')::numeric, 0)
  );

  return v_op;
end;
$$;

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
    spread_per_unit, spread_total
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
    coalesce((p_details->>'spread_total')::numeric, 0)
  );

  return v_op;
end;
$$;

-- Sin GRANT EXECUTE a `authenticated` a propósito — solo la service role
-- (Netlify Functions) puede invocarlas.
