import { describe, expect, it } from 'vitest';
import { calcCash } from './cash';
import { toDisplayNumber } from './money';

describe('calcCash', () => {
  it('4. compra/venta de efectivo — ejemplo del negocio: compra a 17.80, vende a 18.20', () => {
    const r = calcCash({ quantity: 1000, buyPrice: 17.8, sellPrice: 18.2 });
    expect(toDisplayNumber(r.spreadPerUnit)).toBeCloseTo(0.4, 8);
    expect(toDisplayNumber(r.spreadTotal)).toBe(400);
    expect(toDisplayNumber(r.grossProfit)).toBe(400); // cantidad × spread
    expect(toDisplayNumber(r.netProfit)).toBe(400);
  });

  it('efectivo con comisión fija + porcentual y costos adicionales', () => {
    const r = calcCash({
      quantity: 500,
      buyPrice: 17.5,
      sellPrice: 17.9,
      commissionFixed: 25,
      commissionPercent: 1,
      additionalCosts: 10,
    });
    const revenueBeforeFee = 500 * 17.9;
    const commission = 25 + revenueBeforeFee * 0.01;
    expect(toDisplayNumber(r.commissionAmount)).toBeCloseTo(commission, 6);
    expect(toDisplayNumber(r.netProfit)).toBeCloseTo(
      revenueBeforeFee + commission - 500 * 17.5 - 10,
      6
    );
  });
});
