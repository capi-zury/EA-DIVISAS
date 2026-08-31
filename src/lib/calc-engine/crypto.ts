/**
 * Motor de cálculo — Criptomonedas.
 *
 * Distingue explícitamente 3 precios (nunca se fusionan):
 *  - marketPrice: precio de referencia del activo al momento de operar.
 *  - buyPrice: precio real al que EA Divisas adquirió la cripto.
 *  - sellPrice: precio al que EA Divisas se la vendió al cliente.
 *
 * Y separa 4 costos/comisiones que NUNCA se mezclan entre sí:
 *  - providerFeeBuy / providerFeeSell: comisión del exchange/proveedor en cada pata.
 *  - networkFee: costo de blockchain/gas.
 *  - customerFee: comisión explícita cobrada al cliente (aparte del spread).
 *
 * spread y comisión se reportan por separado: el spread es margen implícito
 * en el precio, la comisión es un cobro explícito. Confundirlos rompe la
 * trazabilidad que pide el negocio.
 */
import { money, roundFiat, roundCrypto, pctFactor, type Money, type MoneyInput } from './money.ts';

export interface CryptoInput {
  quantity: MoneyInput;
  marketPrice: MoneyInput;
  buyPrice: MoneyInput;
  sellPrice: MoneyInput;
  providerFeeBuy?: MoneyInput;
  providerFeeSell?: MoneyInput;
  networkFee?: MoneyInput;
  customerFeeFixed?: MoneyInput;
  /** Comisión porcentual cobrada al cliente sobre el ingreso total (0.6 = 0.6%). */
  customerFeePercent?: MoneyInput;
  otherCosts?: MoneyInput;
}

export interface CryptoBreakdownStep {
  label: string;
  formula: string;
  value: Money;
}

export interface CryptoResult {
  acquisitionCost: Money;
  totalRevenue: Money;
  spreadBuy: Money;
  spreadSell: Money;
  totalSpread: Money;
  customerFeeAmount: Money;
  grossProfit: Money;
  netProfit: Money;
  marginPercent: Money;
  breakdown: CryptoBreakdownStep[];
}

export function calcCrypto(input: CryptoInput): CryptoResult {
  const quantity = money(input.quantity);
  const marketPrice = money(input.marketPrice);
  const buyPrice = money(input.buyPrice);
  const sellPrice = money(input.sellPrice);
  const providerFeeBuy = money(input.providerFeeBuy ?? 0);
  const providerFeeSell = money(input.providerFeeSell ?? 0);
  const networkFee = money(input.networkFee ?? 0);
  const customerFeeFixed = money(input.customerFeeFixed ?? 0);
  const customerFeePercent = money(input.customerFeePercent ?? 0);
  const otherCosts = money(input.otherCosts ?? 0);

  // Costo de adquisición: lo que realmente pagó EA Divisas por la cripto + comisión del exchange al comprar.
  const acquisitionCost = quantity.times(buyPrice).plus(providerFeeBuy);

  // Comisión explícita cobrada al cliente, aparte del precio.
  const revenueBeforeFee = quantity.times(sellPrice);
  const customerFeeAmount = customerFeeFixed.plus(revenueBeforeFee.times(pctFactor(customerFeePercent)));

  // Ingreso total: lo que pagó el cliente en total (precio × cantidad + comisión explícita).
  const totalRevenue = revenueBeforeFee.plus(customerFeeAmount);

  // Spread: diferencia entre precio de referencia (mercado) y precio aplicado, en cada pata.
  const spreadBuy = marketPrice.minus(buyPrice).times(quantity); // cuánto mejor que mercado compró EA
  const spreadSell = sellPrice.minus(marketPrice).times(quantity); // cuánto de margen le cargó EA al cliente sobre mercado
  const totalSpread = spreadBuy.plus(spreadSell); // == (sellPrice - buyPrice) * quantity

  // Utilidad bruta = ingresos − costo de adquisición.
  const grossProfit = totalRevenue.minus(acquisitionCost);

  // Utilidad neta = utilidad bruta − comisión del exchange al vender − comisión de red − otros costos.
  const netProfit = grossProfit.minus(providerFeeSell).minus(networkFee).minus(otherCosts);

  const marginPercent = totalRevenue.isZero() ? money(0) : netProfit.dividedBy(totalRevenue).times(100);

  const breakdown: CryptoBreakdownStep[] = [
    { label: 'Costo de adquisición', formula: 'cantidad × precio de compra + comisión del exchange (compra)', value: roundFiat(acquisitionCost) },
    { label: 'Comisión cobrada al cliente', formula: 'comisión fija + (cantidad × precio de venta × % comisión)', value: roundFiat(customerFeeAmount) },
    { label: 'Ingreso total', formula: 'cantidad × precio de venta + comisión cobrada al cliente', value: roundFiat(totalRevenue) },
    { label: 'Spread (compra)', formula: '(precio de mercado − precio de compra) × cantidad', value: roundFiat(spreadBuy) },
    { label: 'Spread (venta)', formula: '(precio de venta − precio de mercado) × cantidad', value: roundFiat(spreadSell) },
    { label: 'Utilidad bruta', formula: 'ingreso total − costo de adquisición', value: roundFiat(grossProfit) },
    { label: 'Utilidad neta', formula: 'utilidad bruta − comisión exchange (venta) − comisión de red − otros costos', value: roundFiat(netProfit) },
  ];

  return {
    acquisitionCost: roundFiat(acquisitionCost),
    totalRevenue: roundFiat(totalRevenue),
    spreadBuy: roundFiat(spreadBuy),
    spreadSell: roundFiat(spreadSell),
    totalSpread: roundFiat(totalSpread),
    customerFeeAmount: roundFiat(customerFeeAmount),
    grossProfit: roundFiat(grossProfit),
    netProfit: roundFiat(netProfit),
    marginPercent: marginPercent.toDecimalPlaces(2),
    breakdown,
  };
}

/** Exportado por si alguna pantalla necesita redondear cantidades de cripto (hasta 8 decimales) al mostrar. */
export { roundCrypto };
