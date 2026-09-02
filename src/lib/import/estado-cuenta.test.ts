import { describe, expect, it } from 'vitest';
import { ecToTransferPayload, parseEstadoCuenta, type EcSheet } from './estado-cuenta';

// NOMBRE / USD / TC son las columnas que identifican la hoja; el resto son opcionales.
const HEADER = ['NOMBRE', 'USD', 'TC', 'TC COMPRA', 'COM %', 'COM $', 'DIFERENCIA', 'CONCEPTO', 'FECHA DE OPERACION'];

function sheet(rows: unknown[][]): EcSheet {
  return { name: 'CLIENTE DEMO', aoa: [HEADER, ...rows] };
}

const payloadOpts = { createdBy: 'user-1', clientId: null, importBatchId: 'batch-1' };

describe('parseEstadoCuenta — reglamento de utilidad', () => {
  it('sin TC de compra: iguala compra a venta, spread 0, gana solo la comisión (ignora la columna DIFERENCIA)', () => {
    // DIFERENCIA de la hoja = 5000 (viene sin el TC de compra restado) — no se usa.
    const [p] = parseEstadoCuenta([sheet([['Beneficiario Uno', 1000, 18, '', '', 200, 5000, 'PAGO', '2026-01-15']])]);
    expect(p.ratesComplete).toBe(false);
    expect(p.tcCompra).toBe(18);
    expect(p.spread).toBe(0);
    expect(p.comUsd).toBe(200);
    expect(p.diferencia).toBe(200);
  });

  it('con TC de compra y de venta completos: suma el spread cambiario', () => {
    const [p] = parseEstadoCuenta([sheet([['Beneficiario Dos', 1000, 18, 17.5, '', 200, '', 'PAGO', '2026-01-16']])]);
    expect(p.ratesComplete).toBe(true);
    expect(p.tcCompra).toBe(17.5);
    expect(p.spread).toBe(500); // 1000 × (18 − 17.5)
    expect(p.comUsd).toBe(200);
    expect(p.diferencia).toBe(700); // comisión + spread
  });

  it('TC de compra fuera de rango se trata como ausente', () => {
    const [p] = parseEstadoCuenta([sheet([['Beneficiario Tres', 1000, 18, 0.5, '', 200, '', 'PAGO', '2026-01-17']])]);
    expect(p.ratesComplete).toBe(false);
    expect(p.spread).toBe(0);
    expect(p.diferencia).toBe(200);
  });

  it('comisión por porcentaje cuando no hay COM $ en pesos', () => {
    const [p] = parseEstadoCuenta([sheet([['Beneficiario Cuatro', 1000, 18, '', 0.01, '', '', 'PAGO', '2026-01-18']])]);
    expect(p.spread).toBe(0);
    expect(p.comUsd).toBe(180); // (1000 × 18) × 0.01
    expect(p.diferencia).toBe(180);
  });
});

describe('ecToTransferPayload — reglamento de utilidad', () => {
  it('sin TC de compra: spread_revenue 0, buy_rate = sell_rate y utilidad = comisión', () => {
    const [p] = parseEstadoCuenta([sheet([['Beneficiario Uno', 1000, 18, '', '', 200, 5000, 'PAGO', '2026-01-15']])]);
    const { header, details } = ecToTransferPayload(p, payloadOpts);
    expect(details.spread_revenue).toBe(0);
    expect(details.buy_rate).toBe(18);
    expect(details.sell_rate).toBe(18);
    expect(details.commission_amount).toBe(200);
    expect(header.gross_profit).toBe(200);
    expect(header.net_profit).toBe(200);
  });

  it('con TC completo: spread_revenue real y utilidad = comisión + spread', () => {
    const [p] = parseEstadoCuenta([sheet([['Beneficiario Dos', 1000, 18, 17.5, '', 200, '', 'PAGO', '2026-01-16']])]);
    const { header, details } = ecToTransferPayload(p, payloadOpts);
    expect(details.spread_revenue).toBe(500);
    expect(details.buy_rate).toBe(17.5);
    expect(details.sell_rate).toBe(18);
    expect(header.gross_profit).toBe(700);
    expect(header.net_profit).toBe(700);
  });
});
