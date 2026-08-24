import { describe, expect, it } from 'vitest';
import { calcTransfer } from './transfers';
import { toDisplayNumber } from './money';

describe('calcTransfer', () => {
  it('1. transferencia simple: mismo tipo de cambio, sin comisión ni costos → utilidad cero', () => {
    const r = calcTransfer({ amountSent: 1000, buyRate: 17.5, sellRate: 17.5 });
    expect(toDisplayNumber(r.amountReceived)).toBe(17500);
    expect(toDisplayNumber(r.costReal)).toBe(17500);
    expect(toDisplayNumber(r.spreadRevenue)).toBe(0);
    expect(toDisplayNumber(r.netProfit)).toBe(0);
  });

  it('2. transferencia con comisión fija + porcentual, sin spread', () => {
    const r = calcTransfer({
      amountSent: 1000,
      buyRate: 17.5,
      sellRate: 17.5,
      commissionFixed: 50,
      commissionPercent: 1,
    });
    expect(toDisplayNumber(r.amountReceived)).toBe(17500);
    expect(toDisplayNumber(r.commissionAmount)).toBe(225); // 50 + 17500*0.01
    expect(toDisplayNumber(r.grossRevenue)).toBe(225);
    expect(toDisplayNumber(r.netProfit)).toBe(225);
    expect(toDisplayNumber(r.marginPercent)).toBeCloseTo(1.29, 2);
  });

  it('3. transferencia con tipo de cambio de compra distinto al de venta + costos operativos', () => {
    const r = calcTransfer({
      amountSent: 2000,
      buyRate: 17.4,
      sellRate: 17.6,
      providerCost: 20,
      bankCost: 10,
      additionalCost: 5,
    });
    expect(toDisplayNumber(r.amountReceived)).toBe(35200);
    expect(toDisplayNumber(r.costReal)).toBe(34800);
    expect(toDisplayNumber(r.spreadRevenue)).toBe(400);
    expect(toDisplayNumber(r.totalCosts)).toBe(35);
    expect(toDisplayNumber(r.grossProfit)).toBe(400);
    expect(toDisplayNumber(r.netProfit)).toBe(365);
  });

  it('el ingreso bruto menos los costos siempre es igual a la utilidad neta (sin errores de redondeo)', () => {
    const r = calcTransfer({
      amountSent: 333.33,
      buyRate: 17.777,
      sellRate: 17.999,
      commissionFixed: 12.34,
      commissionPercent: 0.6,
      providerCost: 3.21,
      bankCost: 1.11,
      additionalCost: 0.05,
    });
    expect(toDisplayNumber(r.grossRevenue) - toDisplayNumber(r.totalCosts)).toBeCloseTo(toDisplayNumber(r.netProfit), 8);
  });

  it('9. es determinista/idempotente — misma entrada produce siempre el mismo resultado (auditable)', () => {
    const input = { amountSent: 777.5, buyRate: 17.62, sellRate: 17.85, commissionFixed: 15 };
    const a = calcTransfer(input);
    const b = calcTransfer(input);
    expect(toDisplayNumber(a.netProfit)).toBe(toDisplayNumber(b.netProfit));
    expect(a.breakdown).toEqual(b.breakdown);
  });
});
