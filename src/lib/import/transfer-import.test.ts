import { describe, expect, it } from 'vitest';
import {
  autoDetectMapping,
  buildCreatePayload,
  mapStatus,
  normalizeRow,
  parseAmount,
  parseDate,
  TEAM_SHEET_HEADERS,
  type ColumnMapping,
  type RawRow,
} from './transfer-import';

describe('parseAmount', () => {
  it('acepta números y strings con separadores', () => {
    expect(parseAmount(1234.5)).toBe(1234.5);
    expect(parseAmount('1,234.56')).toBe(1234.56);
    expect(parseAmount('$ 12,000')).toBe(12000);
    expect(parseAmount('USD 1500')).toBe(1500);
    expect(parseAmount('1.234,56')).toBe(1234.56); // formato europeo
    expect(parseAmount('2,50')).toBe(2.5); // coma decimal
  });

  it('devuelve null cuando no hay número', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount('  ')).toBeNull();
    expect(parseAmount('N/A')).toBeNull();
  });
});

describe('parseDate', () => {
  it('normaliza a yyyy-mm-dd asumiendo dd/mm/yyyy', () => {
    expect(parseDate('03/05/2024')).toBe('2024-05-03');
    expect(parseDate('3-5-24')).toBe('2024-05-03');
    expect(parseDate('2024-05-03')).toBe('2024-05-03');
    expect(parseDate('2024/5/3')).toBe('2024-05-03');
  });

  it('corrige cuando el primer número no puede ser día', () => {
    expect(parseDate('13/02/2024')).toBe('2024-02-13'); // 13 no es mes → dd/mm
  });

  it('convierte el serial de Excel', () => {
    expect(parseDate(45415)).toBe('2024-05-03');
  });

  it('devuelve null si no reconoce la fecha', () => {
    expect(parseDate('mañana')).toBeNull();
    expect(parseDate('')).toBeNull();
  });
});

describe('mapStatus', () => {
  it('traduce alias comunes', () => {
    expect(mapStatus('PAGADO')).toEqual({ status: 'enviada', matched: true });
    expect(mapStatus('completado')).toEqual({ status: 'completada', matched: true });
    expect(mapStatus('En Proceso')).toEqual({ status: 'en_proceso', matched: true });
    expect(mapStatus('cancelada')).toEqual({ status: 'cancelada', matched: true });
  });

  it('lo no reconocido cae en pendiente sin match', () => {
    expect(mapStatus('lo que sea')).toEqual({ status: 'pendiente', matched: false });
    expect(mapStatus('')).toEqual({ status: 'pendiente', matched: false });
  });
});

describe('autoDetectMapping', () => {
  it('empareja los encabezados de la tabla del equipo aun con acentos/typos/espacios', () => {
    const headers = [
      'Fecha', 'PROMOTOR', 'Cliente', 'BENEFICIARIO', 'CUENTA', 'BANCO', 'SWIFT',
      'ROUTING/BANCO INTERMEDIARIO', 'Direccion del Banco', 'DIRECCIÓN DE BENEFICIARIO',
      'TAX ID', 'MONTO USD', 'CONCEPTO', 'ALTA', 'CUENTA CON RECUSROS', 'FACTURA',
      'PAGO', 'TC', 'OBSERVACIONES', 'UETR', 'STATUS',
    ];
    const mapping = autoDetectMapping(headers);
    expect(mapping.montoUsd).toBe('MONTO USD');
    expect(mapping.cliente).toBe('Cliente');
    expect(mapping.direccionBeneficiario).toBe('DIRECCIÓN DE BENEFICIARIO');
    expect(mapping.cuentaConRecursos).toBe('CUENTA CON RECUSROS');
    expect(Object.keys(mapping)).toHaveLength(21);
  });
});

const fullMapping: ColumnMapping = Object.fromEntries(
  Object.entries(TEAM_SHEET_HEADERS).map(([field, header]) => [field, header]),
) as ColumnMapping;

function teamRow(overrides: RawRow = {}): RawRow {
  return {
    FECHA: '03/05/2024',
    PROMOTOR: 'Luis',
    CLIENTE: 'Comercializadora del Norte',
    BENEFICIARIO: 'ACME LLC',
    CUENTA: '1234567890',
    BANCO: 'Chase',
    SWIFT: 'CHASUS33',
    'ROUTING/BANCO INTERMEDIARIO': '021000021',
    'DIRECCION DEL BANCO': '270 Park Ave, NY',
    'DIRECCION DE BENEFICIARIO': '1 Main St, TX',
    'TAX ID': '98-7654321',
    'MONTO USD': '25,000.00',
    CONCEPTO: 'Pago de factura 881',
    ALTA: 'SI',
    'CUENTA CON RECUSROS': 'SI',
    FACTURA: '881',
    PAGO: 'Transferencia',
    TC: '17.85',
    OBSERVACIONES: 'Urgente',
    UETR: 'a1b2c3d4-0000-4000-8000-000000000000',
    STATUS: 'PAGADO',
    ...overrides,
  };
}

describe('normalizeRow', () => {
  it('normaliza una fila completa de la tabla del equipo', () => {
    const r = normalizeRow(teamRow(), fullMapping, 0);
    expect(r.errors).toEqual([]);
    expect(r.rowNumber).toBe(1);
    expect(r.amountUsd).toBe(25000);
    expect(r.operationDate).toBe('2024-05-03');
    expect(r.status).toBe('enviada');
    expect(r.clientName).toBe('Comercializadora del Norte');
    expect(r.tc).toBe(17.85);
    expect(r.banking.swift).toBe('CHASUS33');
    expect(r.banking.uetr).toBe('a1b2c3d4-0000-4000-8000-000000000000');
    expect(r.importKey).toBe('uetr:A1B2C3D4-0000-4000-8000-000000000000');
  });

  it('usa hash estable cuando no hay UETR', () => {
    const a = normalizeRow(teamRow({ UETR: '' }), fullMapping, 0);
    const b = normalizeRow(teamRow({ UETR: '' }), fullMapping, 5);
    expect(a.importKey).toMatch(/^h:[0-9a-f]{16}$/);
    expect(a.importKey).toBe(b.importKey); // no depende del número de fila
  });

  it('marca error cuando falta el monto', () => {
    const r = normalizeRow(teamRow({ 'MONTO USD': '' }), fullMapping, 0);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/Monto USD/);
  });

  it('avisa (sin bloquear) por cliente ausente, fecha rara y status desconocido', () => {
    const r = normalizeRow(teamRow({ CLIENTE: '', FECHA: 'xyz', STATUS: 'raro' }), fullMapping, 0);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(3);
    expect(r.status).toBe('pendiente');
    expect(r.clientName).toBeNull();
  });
});

describe('buildCreatePayload', () => {
  it('arma el payload del RPC con spread 0 y referencias de TC/MXN', () => {
    const r = normalizeRow(teamRow(), fullMapping, 0);
    const { header, details } = buildCreatePayload(r, {
      createdBy: 'user-1',
      clientId: 'client-9',
      importSource: 'google_sheet',
      importBatchId: 'batch-1',
    });

    expect(header.net_profit).toBe(0);
    expect(header.status).toBe('enviada');
    expect(header.operation_date).toBe('2024-05-03');
    expect(header.import_key).toBe('uetr:A1B2C3D4-0000-4000-8000-000000000000');

    expect(details.currency_origin).toBe('USD');
    expect(details.currency_destination).toBe('USD');
    expect(details.amount_sent).toBe(25000);
    expect(details.amount_received).toBe(25000);
    expect(details.buy_rate).toBe(1);
    expect(details.sell_rate).toBe(1);
    expect(details.spread_revenue).toBe(0);
    expect(details.tc_reference).toBe(17.85);
    expect(details.amount_mxn).toBe(446250); // 25000 * 17.85
    expect(details.beneficiary_swift).toBe('CHASUS33');
    expect(details.country_destination).toBe('Estados Unidos');
  });

  it('deja amount_mxn en null si no hay TC', () => {
    const r = normalizeRow(teamRow({ TC: '' }), fullMapping, 0);
    const { details } = buildCreatePayload(r, {
      createdBy: 'u',
      clientId: null,
      importSource: 'excel',
      importBatchId: 'b',
    });
    expect(details.tc_reference).toBeNull();
    expect(details.amount_mxn).toBeNull();
  });
});
