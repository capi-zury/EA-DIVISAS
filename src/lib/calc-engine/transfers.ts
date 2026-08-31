/**
 * Motor de cálculo — Transferencias internacionales.
 *
 * Modelo: el cliente entrega `amountSent` en moneda origen. EA Divisas
 * adquiere la moneda destino a `buyRate` (costo real) y se la entrega al
 * cliente/beneficiario convertida a `sellRate` (tipo de cambio aplicado).
 * La diferencia entre ambos tipos de cambio es el spread cambiario; encima
 * se puede cobrar una comisión explícita (fija y/o porcentual). Los costos
 * de proveedor/banco/adicionales se restan para llegar a la utilidad neta.
 */
import { money, roundFiat, pctFactor, type Money, type MoneyInput } from './money.ts';

export interface TransferInput {
  amountSent: MoneyInput;
  /** Tipo de cambio de compra: lo que le costó a EA Divisas adquirir la moneda destino. */
  buyRate: MoneyInput;
  /** Tipo de cambio de venta: el aplicado al cliente para calcular el monto recibido. */
  sellRate: MoneyInput;
  commissionFixed?: MoneyInput;
  /** Comisión porcentual sobre el monto recibido (0.6 = 0.6%). */
  commissionPercent?: MoneyInput;
  providerCost?: MoneyInput;
  bankCost?: MoneyInput;
  additionalCost?: MoneyInput;
}

export interface TransferBreakdownStep {
  label: string;
  formula: string;
  value: Money;
}

export interface TransferResult {
  amountReceived: Money;
  costReal: Money;
  spreadRevenue: Money;
  commissionAmount: Money;
  grossRevenue: Money;
  totalCosts: Money;
  grossProfit: Money;
  netProfit: Money;
  marginPercent: Money;
  /** Pasos explicando cómo se obtuvo cada número — para mostrar en UI. */
  breakdown: TransferBreakdownStep[];
}

export function calcTransfer(input: TransferInput): TransferResult {
  const amountSent = money(input.amountSent);
  const buyRate = money(input.buyRate);
  const sellRate = money(input.sellRate);
  const commissionFixed = money(input.commissionFixed ?? 0);
  const commissionPercent = money(input.commissionPercent ?? 0);
  const providerCost = money(input.providerCost ?? 0);
  const bankCost = money(input.bankCost ?? 0);
  const additionalCost = money(input.additionalCost ?? 0);

  const amountReceived = amountSent.times(sellRate);
  const costReal = amountSent.times(buyRate);
  const spreadRevenue = amountReceived.minus(costReal);
  const commissionAmount = commissionFixed.plus(amountReceived.times(pctFactor(commissionPercent)));

  const grossRevenue = spreadRevenue.plus(commissionAmount);
  const totalCosts = providerCost.plus(bankCost).plus(additionalCost);

  // Utilidad bruta = spread cambiario + comisión (el costo real vía buyRate ya está descontado dentro del spread).
  const grossProfit = grossRevenue;
  // Utilidad neta = utilidad bruta − costos operativos adicionales (proveedor, banco, otros).
  const netProfit = grossProfit.minus(totalCosts);

  const marginPercent = amountReceived.isZero() ? money(0) : netProfit.dividedBy(amountReceived).times(100);

  const breakdown: TransferBreakdownStep[] = [
    { label: 'Monto recibido', formula: 'monto enviado × tipo de cambio de venta', value: roundFiat(amountReceived) },
    { label: 'Costo real', formula: 'monto enviado × tipo de cambio de compra', value: roundFiat(costReal) },
    { label: 'Spread cambiario', formula: 'monto recibido − costo real', value: roundFiat(spreadRevenue) },
    { label: 'Comisión cobrada', formula: 'comisión fija + (monto recibido × % comisión)', value: roundFiat(commissionAmount) },
    { label: 'Ingreso bruto', formula: 'spread cambiario + comisión cobrada', value: roundFiat(grossRevenue) },
    { label: 'Costos operativos', formula: 'costo proveedor + costo bancario + costo adicional', value: roundFiat(totalCosts) },
    { label: 'Utilidad neta', formula: 'ingreso bruto − costos operativos', value: roundFiat(netProfit) },
  ];

  return {
    amountReceived: roundFiat(amountReceived),
    costReal: roundFiat(costReal),
    spreadRevenue: roundFiat(spreadRevenue),
    commissionAmount: roundFiat(commissionAmount),
    grossRevenue: roundFiat(grossRevenue),
    totalCosts: roundFiat(totalCosts),
    grossProfit: roundFiat(grossProfit),
    netProfit: roundFiat(netProfit),
    marginPercent: round2(marginPercent),
    breakdown,
  };
}

function round2(v: Money): Money {
  return v.toDecimalPlaces(2);
}
