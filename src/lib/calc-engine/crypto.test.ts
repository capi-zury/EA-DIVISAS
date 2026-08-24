import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { calcCrypto } from './crypto';
import { toDisplayNumber } from './money';

describe('calcCrypto', () => {
  it('5. compra/venta simple de cripto (sin fees)', () => {
    const r = calcCrypto({ quantity: 10000, marketPrice: 17.0, buyPrice: 16.95, sellPrice: 17.05 });
    expect(toDisplayNumber(r.acquisitionCost)).toBe(169500);
    expect(toDisplayNumber(r.totalRevenue)).toBe(170500);
    expect(toDisplayNumber(r.grossProfit)).toBe(1000);
    expect(toDisplayNumber(r.netProfit)).toBe(1000);
  });

  it('6. crypto con comisión de trading (provider fee) en compra y venta', () => {
    const r = calcCrypto({
      quantity: 10000,
      marketPrice: 17.0,
      buyPrice: 16.95,
      sellPrice: 17.05,
      providerFeeBuy: 50,
      providerFeeSell: 40,
    });
    expect(toDisplayNumber(r.acquisitionCost)).toBe(169550); // 169500 + 50
    expect(toDisplayNumber(r.grossProfit)).toBe(950); // 170500 - 169550
    expect(toDisplayNumber(r.netProfit)).toBe(910); // 950 - 40
  });

  it('7. crypto con comisión de red (network fee / gas)', () => {
    const r = calcCrypto({ quantity: 10000, marketPrice: 17.0, buyPrice: 16.95, sellPrice: 17.05, networkFee: 25 });
    expect(toDisplayNumber(r.grossProfit)).toBe(1000);
    expect(toDisplayNumber(r.netProfit)).toBe(975); // 1000 - 25
  });

  it('8. spread se reporta separado de la comisión, y no depende del precio de mercado en el total', () => {
    const r = calcCrypto({
      quantity: 5000,
      marketPrice: 17.02,
      buyPrice: 16.9,
      sellPrice: 17.15,
      customerFeeFixed: 100,
    });
    expect(toDisplayNumber(r.spreadBuy)).toBeCloseTo(600, 6); // (17.02-16.90)*5000
    expect(toDisplayNumber(r.spreadSell)).toBeCloseTo(650, 6); // (17.15-17.02)*5000
    expect(toDisplayNumber(r.totalSpread)).toBeCloseTo(1250, 6); // (17.15-16.90)*5000, independiente del precio de mercado
    expect(toDisplayNumber(r.customerFeeAmount)).toBe(100);
    // La comisión no se mezcla con el spread: el ingreso total sí la incluye, el spread no.
    expect(toDisplayNumber(r.totalRevenue)).toBe(5000 * 17.15 + 100);
  });

  it('utilidad neta = ingresos − costo de adquisición − comisión exchange (venta) − red − otros costos, sin errores de redondeo', () => {
    const input = {
      quantity: 12345.6789,
      marketPrice: 17.111,
      buyPrice: 17.05,
      sellPrice: 17.22,
      providerFeeBuy: 12.5,
      providerFeeSell: 8.75,
      networkFee: 3.4,
      customerFeeFixed: 20,
      customerFeePercent: 0.5,
      otherCosts: 1.11,
    };
    const r = calcCrypto(input);

    // Reconstruye la utilidad esperada en precisión completa (Decimal, sin redondear
    // intermedios) para verificar que el motor no pierde/gana centavos por redondear
    // dos veces — el motor solo redondea una vez, al final.
    const quantity = new Decimal(input.quantity);
    const totalRevenueExact = quantity
      .times(input.sellPrice)
      .plus(input.customerFeeFixed)
      .plus(quantity.times(input.sellPrice).times(input.customerFeePercent).dividedBy(100));
    const acquisitionCostExact = quantity.times(input.buyPrice).plus(input.providerFeeBuy);
    const netExact = totalRevenueExact
      .minus(acquisitionCostExact)
      .minus(input.providerFeeSell)
      .minus(input.networkFee)
      .minus(input.otherCosts)
      .toDecimalPlaces(2);

    expect(toDisplayNumber(r.netProfit)).toBe(netExact.toNumber());
  });
});
