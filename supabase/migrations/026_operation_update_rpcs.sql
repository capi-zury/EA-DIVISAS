-- 026: funciones para CORREGIR una operación ya creada (no solo cambiar su
-- estado — ver update_operation_status en 016). A diferencia de las
-- funciones de creación (019), estas NO son security definer: corren con
-- los permisos del que llama, así que dependen 100% de las políticas RLS
-- ya existentes (operations_update_admin, international_transfers_update_admin,
-- etc. — solo super_admin/admin) para decidir quién puede editar. Si alguien
-- sin permiso las llama, el UPDATE simplemente no afecta ninguna fila.
--
-- Igual que en creación: los valores financieros ya vienen recalculados por
-- el motor de cálculo del lado del cliente antes de llegar aquí — esta
-- función solo persiste, nunca recalcula.

create or replace function divisas.update_transfer_operation(p_operation_id uuid, p_header jsonb, p_details jsonb)
returns divisas.operations
language plpgsql
as $$
declare
  v_op divisas.operations;
begin
  update divisas.operations set
    client_id = coalesce((p_header->>'client_id')::uuid, client_id),
    provider_id = (p_header->>'provider_id')::uuid,
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

  update divisas.international_transfers set
    country_origin = p_details->>'country_origin',
    country_destination = p_details->>'country_destination',
    currency_origin = p_details->>'currency_origin',
    currency_destination = p_details->>'currency_destination',
    amount_sent = (p_details->>'amount_sent')::numeric,
    amount_received = (p_details->>'amount_received')::numeric,
    exchange_rate_applied = (p_details->>'exchange_rate_applied')::numeric,
    buy_rate = (p_details->>'buy_rate')::numeric,
    sell_rate = (p_details->>'sell_rate')::numeric,
    commission_fixed = coalesce((p_details->>'commission_fixed')::numeric, 0),
    commission_percent = coalesce((p_details->>'commission_percent')::numeric, 0),
    commission_amount = coalesce((p_details->>'commission_amount')::numeric, 0),
    provider_cost = coalesce((p_details->>'provider_cost')::numeric, 0),
    bank_cost = coalesce((p_details->>'bank_cost')::numeric, 0),
    additional_cost = coalesce((p_details->>'additional_cost')::numeric, 0),
    spread_revenue = coalesce((p_details->>'spread_revenue')::numeric, 0)
  where operation_id = p_operation_id;

  return v_op;
end;
$$;

create or replace function divisas.update_crypto_operation(p_operation_id uuid, p_header jsonb, p_details jsonb)
returns divisas.operations
language plpgsql
as $$
declare
  v_op divisas.operations;
begin
  update divisas.operations set
    client_id = coalesce((p_header->>'client_id')::uuid, client_id),
    provider_id = (p_header->>'provider_id')::uuid,
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

  update divisas.crypto_transactions set
    tx_hash = p_details->>'tx_hash',
    wallet_origin_address = p_details->>'wallet_origin_address',
    wallet_destination_address = p_details->>'wallet_destination_address',
    quantity = (p_details->>'quantity')::numeric,
    market_price = (p_details->>'market_price')::numeric,
    buy_price = (p_details->>'buy_price')::numeric,
    sell_price = (p_details->>'sell_price')::numeric,
    provider_fee_buy = coalesce((p_details->>'provider_fee_buy')::numeric, 0),
    provider_fee_sell = coalesce((p_details->>'provider_fee_sell')::numeric, 0),
    network_fee = coalesce((p_details->>'network_fee')::numeric, 0),
    customer_fee_fixed = coalesce((p_details->>'customer_fee_fixed')::numeric, 0),
    customer_fee_percent = coalesce((p_details->>'customer_fee_percent')::numeric, 0),
    customer_fee_amount = coalesce((p_details->>'customer_fee_amount')::numeric, 0),
    spread_buy = coalesce((p_details->>'spread_buy')::numeric, 0),
    spread_sell = coalesce((p_details->>'spread_sell')::numeric, 0),
    acquisition_cost = coalesce((p_details->>'acquisition_cost')::numeric, 0),
    total_revenue = coalesce((p_details->>'total_revenue')::numeric, 0)
  where operation_id = p_operation_id;

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
    spread_total = coalesce((p_details->>'spread_total')::numeric, 0)
  where operation_id = p_operation_id;

  return v_op;
end;
$$;

grant execute on function divisas.update_transfer_operation(uuid, jsonb, jsonb) to authenticated;
grant execute on function divisas.update_crypto_operation(uuid, jsonb, jsonb) to authenticated;
grant execute on function divisas.update_cash_operation(uuid, jsonb, jsonb) to authenticated;
