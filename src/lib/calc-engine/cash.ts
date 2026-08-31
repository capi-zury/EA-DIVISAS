/**
 * Motor de cálculo — Efectivo / dólares.
 *
 * Cada operación registra su propio precio de compra y venta (el spread
 * que EA Divisas capturó en esa transacción específica), más comisión
 * fija/porcentual y costos adicionales opcionales encima.
 *
 * Ejemplo del negocio: EA compra USD a $17.80, EA vende USD a $18.20 →
 * spread = $0.40 → utilidad = cantidad × spread (antes de comisión/costos).
 *
 * Reparto con proveedor (opcional): si la operación se hizo a través de un
 * proveedor externo, se le puede dar un % de la comisión cobrada — el
 * resto es la ganancia real de EA Divisas. Si no hay proveedor (o su %
 * queda vacío/cero), el 100% de la comisión es ganancia de la empresa.
 */
import { money, roundFiat, pctFactor, type Money, type MoneyInput } from './money.ts';

export interface CashInput {
  quantity: MoneyInput;
  buyPrice: MoneyInput;
  sellPrice: MoneyInput;
  commissionFixed?: MoneyInput;
  /** Comisión porcentual sobre el ingreso (0.6 = 0.6%). */
  commissionPercent?: MoneyInput;
  additionalCosts?: MoneyInput;
  /** % de la comisión cobrada que se lleva el proveedor (0.6 = 0.6%). Vacío/0 = todo para EA Divisas. */
  providerCommissionPercent?: MoneyInput;
}

export interface CashBreakdownStep {
  label: string;
  formula: string;
  value: Money;
}

export interface CashResult {
  cost: Money;
  revenue: Money;
  spreadPerUnit: Money;
  spreadTotal: Money;
  commissionAmount: Money;
  providerCommissionAmount: Money;
  ourCommissionAmount: Money;
  grossProfit: Money;
  netProfit: Money;
  marginPercent: Money;
  breakdown: CashBreakdownStep[];
}

export function calcCash(input: CashInput): CashResult {
  const quantity = money(input.quantity);
  const buyPrice = money(input.buyPrice);
  const sellPrice = money(input.sellPrice);
  const commissionFixed = money(input.commissionFixed ?? 0);
  const commissionPercent = money(input.commissionPercent ?? 0);
  const additionalCosts = money(input.additionalCosts ?? 0);
  const providerCommissionPercent = money(input.providerCommissionPercent ?? 0);

  const cost = quantity.times(buyPrice);
  const revenueBeforeFee = quantity.times(sellPrice);
  const commissionAmount = commissionFixed.plus(revenueBeforeFee.times(pctFactor(commissionPercent)));
  const revenue = revenueBeforeFee.plus(commissionAmount);

  const spreadPerUnit = sellPrice.minus(buyPrice);
  const spreadTotal = spreadPerUnit.times(quantity);

  // Del total de comisión cobrada, lo que se lleva el proveedor (si hay uno) y lo que nos queda.
  const providerCommissionAmount = commissionAmount.times(pctFactor(providerCommissionPercent));
  const ourCommissionAmount = commissionAmount.minus(providerCommissionAmount);

  // Utilidad bruta = spread total + comisión explícita (== ingreso total − costo).
  const grossProfit = revenue.minus(cost);
  // Utilidad neta = utilidad bruta − lo que se lleva el proveedor − costos adicionales.
  const netProfit = grossProfit.minus(providerCommissionAmount).minus(additionalCosts);

  const marginPercent = revenue.isZero() ? money(0) : netProfit.dividedBy(revenue).times(100);

  const breakdown: CashBreakdownStep[] = [
    { label: 'Costo', formula: 'cantidad × precio de compra', value: roundFiat(cost) },
    { label: 'Comisión cobrada', formula: 'comisión fija + (cantidad × precio de venta × % comisión)', value: roundFiat(commissionAmount) },
    { label: 'Ingreso', formula: 'cantidad × precio de venta + comisión cobrada', value: roundFiat(revenue) },
    { label: 'Spread por unidad', formula: 'precio de venta − precio de compra', value: roundFiat(spreadPerUnit) },
    { label: 'Spread total', formula: 'spread por unidad × cantidad', value: roundFiat(spreadTotal) },
    { label: 'Ganancia del proveedor', formula: 'comisión cobrada × % proveedor', value: roundFiat(providerCommissionAmount) },
    { label: 'Ganancia nuestra (de la comisión)', formula: 'comisión cobrada − ganancia del proveedor', value: roundFiat(ourCommissionAmount) },
    { label: 'Utilidad bruta', formula: 'ingreso − costo', value: roundFiat(grossProfit) },
    { label: 'Utilidad neta', formula: 'utilidad bruta − ganancia del proveedor − costos adicionales', value: roundFiat(netProfit) },
  ];

  return {
    cost: roundFiat(cost),
    revenue: roundFiat(revenue),
    spreadPerUnit: roundFiat(spreadPerUnit),
    spreadTotal: roundFiat(spreadTotal),
    commissionAmount: roundFiat(commissionAmount),
    providerCommissionAmount: roundFiat(providerCommissionAmount),
    ourCommissionAmount: roundFiat(ourCommissionAmount),
    grossProfit: roundFiat(grossProfit),
    netProfit: roundFiat(netProfit),
    marginPercent: marginPercent.toDecimalPlaces(2),
    breakdown,
  };
}
