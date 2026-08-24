/**
 * Única vía para crear una operación (transferencia/cripto/efectivo).
 *
 * RLS bloquea el INSERT directo en divisas.operations para todos los
 * roles — a propósito. Esta función es la que:
 *   1. Verifica quién llama (JWT) y su rol.
 *   2. Corre el motor de cálculo centralizado (src/lib/calc-engine) sobre
 *      los insumos crudos — nunca confía en un total que venga ya calculado
 *      del navegador.
 *   3. Persiste cabecera + detalle de módulo en una transacción (RPC SQL).
 */
import { calcCash, calcCrypto, calcTransfer, toDisplayNumber } from '../../src/lib/calc-engine';
import { getCallerProfile, getCallingUser, supabaseAdmin } from './_shared/supabase-admin';
import { createOperationRequestSchema } from './_shared/schemas';

const ALLOWED_ROLES = new Set(['super_admin', 'admin', 'operador']);

function json(statusCode: number, body: unknown) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export const handler = async (event: { httpMethod: string; body: string | null; headers: Record<string, string | undefined> }) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Método no permitido.' });
  }

  const user = await getCallingUser(event.headers.authorization || event.headers.Authorization);
  if (!user) return json(401, { error: 'No autenticado.' });

  const profile = await getCallerProfile(user.id);
  if (!profile || !profile.active) return json(403, { error: 'Usuario inactivo o sin perfil.' });
  if (!ALLOWED_ROLES.has(profile.role)) return json(403, { error: `Rol ${profile.role} no puede crear operaciones.` });

  let payload;
  try {
    payload = createOperationRequestSchema.parse(JSON.parse(event.body || '{}'));
  } catch (err) {
    return json(400, { error: 'Entrada inválida.', details: err instanceof Error ? err.message : String(err) });
  }

  const admin = supabaseAdmin();
  const header = {
    ...payload.header,
    created_by: user.id,
  };

  try {
    if (payload.module === 'transferencia') {
      const d = payload.details;
      const calc = calcTransfer({
        amountSent: d.amountSent,
        buyRate: d.buyRate,
        sellRate: d.sellRate,
        commissionFixed: d.commissionFixed,
        commissionPercent: d.commissionPercent,
        providerCost: d.providerCost,
        bankCost: d.bankCost,
        additionalCost: d.additionalCost,
      });

      const { data, error } = await admin.rpc('create_transfer_operation', {
        p_header: {
          ...header,
          gross_revenue: toDisplayNumber(calc.grossRevenue),
          total_costs: toDisplayNumber(calc.totalCosts),
          gross_profit: toDisplayNumber(calc.grossProfit),
          net_profit: toDisplayNumber(calc.netProfit),
          margin_percent: toDisplayNumber(calc.marginPercent),
        },
        p_details: {
          contact_phone: d.contactPhone ?? null,
          country_origin: d.countryOrigin,
          country_destination: d.countryDestination,
          currency_origin: d.currencyOrigin,
          currency_destination: d.currencyDestination,
          amount_sent: toDisplayNumber(d.amountSent),
          amount_received: toDisplayNumber(calc.amountReceived),
          exchange_rate_applied: toDisplayNumber(d.sellRate),
          buy_rate: toDisplayNumber(d.buyRate),
          sell_rate: toDisplayNumber(d.sellRate),
          commission_fixed: toDisplayNumber(d.commissionFixed ?? 0),
          commission_percent: toDisplayNumber(d.commissionPercent ?? 0),
          commission_amount: toDisplayNumber(calc.commissionAmount),
          provider_cost: toDisplayNumber(d.providerCost ?? 0),
          bank_cost: toDisplayNumber(d.bankCost ?? 0),
          additional_cost: toDisplayNumber(d.additionalCost ?? 0),
          spread_revenue: toDisplayNumber(calc.spreadRevenue),
          expected_amount: d.expectedAmount != null ? toDisplayNumber(d.expectedAmount) : null,
          actual_amount: d.actualAmount != null ? toDisplayNumber(d.actualAmount) : null,
          amount_difference:
            d.expectedAmount != null && d.actualAmount != null
              ? toDisplayNumber(d.actualAmount) - toDisplayNumber(d.expectedAmount)
              : null,
        },
      });
      if (error) throw error;
      return json(201, { operation: data, calc });
    }

    if (payload.module === 'cripto') {
      const d = payload.details;
      const calc = calcCrypto({
        quantity: d.quantity,
        marketPrice: d.marketPrice,
        buyPrice: d.buyPrice,
        sellPrice: d.sellPrice,
        providerFeeBuy: d.providerFeeBuy,
        providerFeeSell: d.providerFeeSell,
        networkFee: d.networkFee,
        customerFeeFixed: d.customerFeeFixed,
        customerFeePercent: d.customerFeePercent,
      });

      const { data, error } = await admin.rpc('create_crypto_operation', {
        p_header: {
          ...header,
          gross_revenue: toDisplayNumber(calc.totalRevenue),
          total_costs: toDisplayNumber(calc.acquisitionCost) + toDisplayNumber(d.providerFeeSell ?? 0) + toDisplayNumber(d.networkFee ?? 0),
          gross_profit: toDisplayNumber(calc.grossProfit),
          net_profit: toDisplayNumber(calc.netProfit),
          margin_percent: toDisplayNumber(calc.marginPercent),
        },
        p_details: {
          crypto_asset_code: d.cryptoAssetCode,
          crypto_network_id: d.cryptoNetworkId,
          tx_hash: d.txHash ?? null,
          wallet_origin_address: d.walletOriginAddress ?? null,
          wallet_destination_address: d.walletDestinationAddress ?? null,
          wallet_origin_id: d.walletOriginId ?? null,
          wallet_destination_id: d.walletDestinationId ?? null,
          quantity: toDisplayNumber(d.quantity),
          market_price: toDisplayNumber(d.marketPrice),
          buy_price: toDisplayNumber(d.buyPrice),
          sell_price: toDisplayNumber(d.sellPrice),
          fx_rate_mxn_usd: d.fxRateMxnUsd != null ? toDisplayNumber(d.fxRateMxnUsd) : null,
          provider_fee_buy: toDisplayNumber(d.providerFeeBuy ?? 0),
          provider_fee_sell: toDisplayNumber(d.providerFeeSell ?? 0),
          network_fee: toDisplayNumber(d.networkFee ?? 0),
          customer_fee_fixed: toDisplayNumber(d.customerFeeFixed ?? 0),
          customer_fee_percent: toDisplayNumber(d.customerFeePercent ?? 0),
          customer_fee_amount: toDisplayNumber(calc.customerFeeAmount),
          spread_buy: toDisplayNumber(calc.spreadBuy),
          spread_sell: toDisplayNumber(calc.spreadSell),
          acquisition_cost: toDisplayNumber(calc.acquisitionCost),
          total_revenue: toDisplayNumber(calc.totalRevenue),
        },
      });
      if (error) throw error;
      return json(201, { operation: data, calc });
    }

    // efectivo
    const d = payload.details;
    const calc = calcCash({
      quantity: d.quantity,
      buyPrice: d.buyPrice,
      sellPrice: d.sellPrice,
      commissionFixed: d.commissionFixed,
      commissionPercent: d.commissionPercent,
      additionalCosts: d.additionalCosts,
    });

    const { data, error } = await admin.rpc('create_cash_operation', {
      p_header: {
        ...header,
        gross_revenue: toDisplayNumber(calc.revenue),
        total_costs: toDisplayNumber(calc.cost) + toDisplayNumber(d.additionalCosts ?? 0),
        gross_profit: toDisplayNumber(calc.grossProfit),
        net_profit: toDisplayNumber(calc.netProfit),
        margin_percent: toDisplayNumber(calc.marginPercent),
      },
      p_details: {
        currency_code: d.currencyCode,
        denomination: d.denomination ?? null,
        quantity: toDisplayNumber(d.quantity),
        buy_price: toDisplayNumber(d.buyPrice),
        sell_price: toDisplayNumber(d.sellPrice),
        exchange_rate_reference: d.exchangeRateReference != null ? toDisplayNumber(d.exchangeRateReference) : null,
        commission_fixed: toDisplayNumber(d.commissionFixed ?? 0),
        commission_percent: toDisplayNumber(d.commissionPercent ?? 0),
        commission_amount: toDisplayNumber(calc.commissionAmount),
        spread_per_unit: toDisplayNumber(calc.spreadPerUnit),
        spread_total: toDisplayNumber(calc.spreadTotal),
      },
    });
    if (error) throw error;
    return json(201, { operation: data, calc });
  } catch (err) {
    console.error(err);
    return json(500, { error: 'No se pudo crear la operación.', details: err instanceof Error ? err.message : String(err) });
  }
};
