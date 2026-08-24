/**
 * Motor de cálculo — Efectivo / dólares.
 *
 * Cada operación registra su propio precio de compra y venta (el spread
 * que EA Divisas capturó en esa transacción específica), más comisión
 * fija/porcentual y costos adicionales opcionales encima.
 *
 * Ejemplo del negocio: EA compra USD a $17.80, EA vende USD a $18.20 →
 * spread = $0.40 → utilidad = cantidad × spread (antes de comisión/costos).
 */
import { money, roundFiat, pctFactor, type Money, type MoneyInput } from './money';

export interface CashInput {
  quantity: MoneyInput;
  buyPrice: MoneyInput;
  sellPrice: MoneyInput;
  commissionFixed?: MoneyInput;
  /** Comisión porcentual sobre el ingreso (0.6 = 0.6%). */
  commissionPercent?: MoneyInput;
  additionalCosts?: MoneyInput;
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

  const cost = quantity.times(buyPrice);
  const revenueBeforeFee = quantity.times(sellPrice);
  const commissionAmount = commissionFixed.plus(revenueBeforeFee.times(pctFactor(commissionPercent)));
  const revenue = revenueBeforeFee.plus(commissionAmount);

  const spreadPerUnit = sellPrice.minus(buyPrice);
  const spreadTotal = spreadPerUnit.times(quantity);

  // Utilidad bruta = spread total + comisión explícita (== ingreso total − costo).
  const grossProfit = revenue.minus(cost);
  const netProfit = grossProfit.minus(additionalCosts);

  const marginPercent = revenue.isZero() ? money(0) : netProfit.dividedBy(revenue).times(100);

  const breakdown: CashBreakdownStep[] = [
    { label: 'Costo', formula: 'cantidad × precio de compra', value: roundFiat(cost) },
    { label: 'Comisión cobrada', formula: 'comisión fija + (cantidad × precio de venta × % comisión)', value: roundFiat(commissionAmount) },
    { label: 'Ingreso', formula: 'cantidad × precio de venta + comisión cobrada', value: roundFiat(revenue) },
    { label: 'Spread por unidad', formula: 'precio de venta − precio de compra', value: roundFiat(spreadPerUnit) },
    { label: 'Spread total', formula: 'spread por unidad × cantidad', value: roundFiat(spreadTotal) },
    { label: 'Utilidad bruta', formula: 'ingreso − costo', value: roundFiat(grossProfit) },
    { label: 'Utilidad neta', formula: 'utilidad bruta − costos adicionales', value: roundFiat(netProfit) },
  ];

  return {
    cost: roundFiat(cost),
    revenue: roundFiat(revenue),
    spreadPerUnit: roundFiat(spreadPerUnit),
    spreadTotal: roundFiat(spreadTotal),
    commissionAmount: roundFiat(commissionAmount),
    grossProfit: roundFiat(grossProfit),
    netProfit: roundFiat(netProfit),
    marginPercent: marginPercent.toDecimalPlaces(2),
    breakdown,
  };
}
