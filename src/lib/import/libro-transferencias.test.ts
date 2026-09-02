import { describe, expect, it } from 'vitest';
import {
  libroImportKey,
  libroToTransferPayload,
  looksLikeLibroTransferencias,
  parseLibroTransferencias,
  type LibroSheet,
} from './libro-transferencias';

const HEADER = [
  'FECHA',
  'CLIENTE',
  'MONTO RECIBIDO',
  'MONTO USD',
  'TIPO DE CAMBIO COMPRA',
  'COSTO DE OPERACIÓN',
  'DIFERENCIA',
  'COMISIÓN 1% CP',
  'COMISIONES CP',
  'COMISIONES BANKAOOL',
  'COMIS COMISIONISTA',
  'TOTAL',
  'TOTAL CASA',
  'CUENTA',
  'SALDO',
];

// Fila real ALINEADA (ROBERTO, 2026-09-01): 15 columnas.
const ROBERTO = ['2026-09-01T06:00:36.000Z', 'ROBERTO', 1010000, 58585.74, 17.0366, 998100, 11900, 1010, 6.96, 5.8, '', 10877.24, 10877.24, 'P19', 10877.24];
// Fila real CORRIDA (DIEGO): le falta la celda "COMISIÓN 1% CP", 14 columnas.
const DIEGO = ['2026-09-01T06:00:36.000Z', 'DIEGO', 2631750.32, 153915.8, 17.0206, 2619744.69, 12005.63, 6.96, 5.8, '', 9105.81, 9105.81, 'P38', 39499.31];

function sheet(rows: unknown[][]): LibroSheet {
  return {
    name: 'Hoja1',
    aoa: [
      ['', '', '', '', '', '', ' ', '', '', '', '', '', '', '', ''],
      HEADER,
      ['SEPTIEMBRE', '', '', '', '', '', '', '', '', '', '', '', '', '', ''], // fila de sección → se ignora
      ...rows,
    ],
  };
}

const opts = { createdBy: 'user-1', clientId: null, importBatchId: 'batch-1' };

describe('parseLibroTransferencias', () => {
  it('reconoce el formato', () => {
    expect(looksLikeLibroTransferencias([sheet([ROBERTO])])).toBe(true);
    expect(looksLikeLibroTransferencias([{ name: 'x', aoa: [['a', 'b', 'c']] }])).toBe(false);
  });

  it('fila alineada: TOTAL CASA del Excel, costos = spread − TOTAL CASA', () => {
    const [p] = parseLibroTransferencias([sheet([ROBERTO])]);
    expect(p.client).toBe('ROBERTO');
    expect(p.date).toBe('2026-09-01');
    expect(p.account).toBe('P19');
    expect(p.usd).toBe(58585.74);
    expect(p.mxnReceived).toBe(1010000);
    expect(p.tcCompra).toBe(17.0366);
    expect(p.costoOperacion).toBe(998100);
    expect(p.spread).toBe(11900);
    expect(p.totalCasa).toBe(10877.24);
    expect(p.totalCosts).toBe(1022.76); // 11900 − 10877.24
  });

  it('fila con columna corrida: se ancla en CUENTA y toma TOTAL CASA igual', () => {
    const [p] = parseLibroTransferencias([sheet([DIEGO])]);
    expect(p.account).toBe('P38');
    expect(p.spread).toBe(12005.63);
    expect(p.totalCasa).toBe(9105.81); // del Excel, no recalculado
    expect(p.totalCosts).toBe(2899.82);
  });

  it('ignora la fila de sección "SEPTIEMBRE" y las vacías', () => {
    const pagos = parseLibroTransferencias([
      sheet([ROBERTO, ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '']]),
    ]);
    expect(pagos).toHaveLength(1);
  });

  it('deduplica filas idénticas', () => {
    const pagos = parseLibroTransferencias([sheet([ROBERTO, [...ROBERTO]])]);
    expect(pagos).toHaveLength(1);
  });

  it('deriva costo/diferencia si las columnas vienen vacías', () => {
    const row = ['2026-09-02', 'TEST', 170000, 10000, 17, '', '', '', '', '', '', '', '', 'P10', ''];
    const [p] = parseLibroTransferencias([sheet([row])]);
    expect(p.costoOperacion).toBe(170000); // 10000 × 17
    expect(p.spread).toBe(0);
    expect(p.totalCasa).toBe(0);
    expect(p.totalCosts).toBe(0);
  });
});

describe('libroToTransferPayload', () => {
  it('utilidad = TOTAL CASA; spread bruto y costos por separado', () => {
    const [p] = parseLibroTransferencias([sheet([ROBERTO])]);
    const { header, details } = libroToTransferPayload(p, opts);
    expect(header.gross_revenue).toBe(11900);
    expect(header.gross_profit).toBe(11900);
    expect(header.total_costs).toBe(1022.76);
    expect(header.net_profit).toBe(10877.24);
    expect(header.import_key).toBe(libroImportKey(p));
    expect(details.amount_sent).toBe(58585.74);
    expect(details.amount_received).toBe(1010000);
    expect(details.buy_rate).toBe(17.0366);
    expect(details.additional_cost).toBe(1022.76);
    expect(details.spread_revenue).toBe(11900);
  });

  it('fila corrida: net_profit sigue el TOTAL CASA del Excel', () => {
    const [p] = parseLibroTransferencias([sheet([DIEGO])]);
    const { header } = libroToTransferPayload(p, opts);
    expect(header.net_profit).toBe(9105.81);
    expect(header.gross_profit).toBe(12005.63);
    expect(header.total_costs).toBe(2899.82);
  });
});
