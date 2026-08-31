/**
 * Motor de cálculo — Conciliación (esperado vs. real).
 */
import { money, roundFiat, type Money, type MoneyInput } from './money.ts';

export type ReconciliationStatus = 'conciliado' | 'diferencia' | 'pendiente_revision';

export interface ReconciliationInput {
  expectedAmount: MoneyInput;
  actualAmount: MoneyInput;
  /** Tolerancia absoluta antes de marcar "diferencia" (por defecto 0 = cualquier diferencia cuenta). */
  toleranceAmount?: MoneyInput;
}

export interface ReconciliationResult {
  expectedAmount: Money;
  actualAmount: Money;
  difference: Money;
  status: ReconciliationStatus;
}

export function calcReconciliation(input: ReconciliationInput): ReconciliationResult {
  const expectedAmount = money(input.expectedAmount);
  const actualAmount = money(input.actualAmount);
  const tolerance = money(input.toleranceAmount ?? 0).abs();

  const difference = actualAmount.minus(expectedAmount);
  const status: ReconciliationStatus = difference.abs().lessThanOrEqualTo(tolerance) ? 'conciliado' : 'diferencia';

  return {
    expectedAmount: roundFiat(expectedAmount),
    actualAmount: roundFiat(actualAmount),
    difference: roundFiat(difference),
    status,
  };
}
