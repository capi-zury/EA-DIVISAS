import { describe, expect, it } from 'vitest';
import { calcReconciliation } from './reconciliation';
import { toDisplayNumber } from './money';

describe('calcReconciliation', () => {
  it('10. diferencia de conciliación: esperado $100,000 vs. real $99,950 → -$50, estado "diferencia"', () => {
    const r = calcReconciliation({ expectedAmount: 100000, actualAmount: 99950 });
    expect(toDisplayNumber(r.difference)).toBe(-50);
    expect(r.status).toBe('diferencia');
  });

  it('monto esperado == monto real → estado "conciliado"', () => {
    const r = calcReconciliation({ expectedAmount: 25000, actualAmount: 25000 });
    expect(toDisplayNumber(r.difference)).toBe(0);
    expect(r.status).toBe('conciliado');
  });

  it('respeta tolerancia configurable antes de marcar diferencia', () => {
    const r = calcReconciliation({ expectedAmount: 10000, actualAmount: 9999.5, toleranceAmount: 1 });
    expect(r.status).toBe('conciliado');
  });
});
