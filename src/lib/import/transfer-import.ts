/**
 * Normalización de filas externas → operación de transferencia.
 *
 * Lo importan TANTO el frontend (preview del asistente de importación) COMO
 * las Netlify Functions (importación autoritativa) — misma lógica en los
 * dos lados, igual que el motor de cálculo. No debe importar nada que sea
 * solo-navegador ni solo-servidor (por eso el hash de deduplicación es un
 * hash simple y síncrono, no `node:crypto`).
 *
 * Contexto de negocio: la tabla del equipo (Google Sheet / Excel) es un
 * registro operativo y de compliance, no una calculadora de margen. Trae un
 * solo tipo de cambio (TC) y sin comisión. Por eso cada fila importada se
 * guarda SIN spread (buy_rate = sell_rate = 1, principal en USD) y el TC y
 * el equivalente en MXN quedan solo como referencia.
 */
import { calcTransfer, toDisplayNumber } from '../calc-engine/index.ts';
import type { TransferResult } from '../calc-engine/index.ts';
import { OPERATION_STATUSES } from '../domain/operation-status.ts';
import type { OperationStatus } from '../domain/operation-status.ts';

// ---------- Campos canónicos de importación ----------

export const IMPORT_FIELDS = [
  'fecha',
  'promotor',
  'cliente',
  'beneficiario',
  'cuenta',
  'banco',
  'swift',
  'bancoIntermediario',
  'direccionBanco',
  'direccionBeneficiario',
  'taxId',
  'montoUsd',
  'concepto',
  'alta',
  'cuentaConRecursos',
  'factura',
  'pago',
  'tc',
  'observaciones',
  'uetr',
  'status',
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Etiqueta en español para la pantalla de mapeo de columnas. */
export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  fecha: 'Fecha',
  promotor: 'Promotor',
  cliente: 'Cliente',
  beneficiario: 'Beneficiario',
  cuenta: 'Cuenta',
  banco: 'Banco',
  swift: 'SWIFT',
  bancoIntermediario: 'Routing / banco intermediario',
  direccionBanco: 'Dirección del banco',
  direccionBeneficiario: 'Dirección del beneficiario',
  taxId: 'Tax ID',
  montoUsd: 'Monto USD',
  concepto: 'Concepto',
  alta: 'Alta',
  cuentaConRecursos: 'Cuenta con recursos',
  factura: 'Factura',
  pago: 'Pago',
  tc: 'Tipo de cambio (TC)',
  observaciones: 'Observaciones',
  uetr: 'UETR',
  status: 'Status',
};

/** Lo único imprescindible para poder importar una fila. */
export const REQUIRED_IMPORT_FIELDS: readonly ImportField[] = ['montoUsd'];

/**
 * Encabezados EXACTOS de la tabla del equipo, por campo canónico. Se usan
 * para auto-detectar el mapeo cuando el archivo/Sheet trae esas columnas.
 * (Incluye el encabezado tal cual está hoy en la hoja, con su typo
 * "RECUSROS" — el emparejado es tolerante a acentos, mayúsculas y espacios.)
 */
export const TEAM_SHEET_HEADERS: Record<ImportField, string> = {
  fecha: 'FECHA',
  promotor: 'PROMOTOR',
  cliente: 'CLIENTE',
  beneficiario: 'BENEFICIARIO',
  cuenta: 'CUENTA',
  banco: 'BANCO',
  swift: 'SWIFT',
  bancoIntermediario: 'ROUTING/BANCO INTERMEDIARIO',
  direccionBanco: 'DIRECCION DEL BANCO',
  direccionBeneficiario: 'DIRECCION DE BENEFICIARIO',
  taxId: 'TAX ID',
  montoUsd: 'MONTO USD',
  concepto: 'CONCEPTO',
  alta: 'ALTA',
  cuentaConRecursos: 'CUENTA CON RECUSROS',
  factura: 'FACTURA',
  pago: 'PAGO',
  tc: 'TC',
  observaciones: 'OBSERVACIONES',
  uetr: 'UETR',
  status: 'STATUS',
};

export type ColumnMapping = Partial<Record<ImportField, string>>;

// ---------- Utilidades de parseo ----------

/** MAYÚSCULAS, sin acentos, espacios colapsados. Para emparejar encabezados y status. */
export function normalizeKey(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/** Acepta 1234.56, "1,234.56", "$ 1 234,56", "USD 1234". Devuelve null si no hay número. */
export function parseAmount(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let s = String(value).trim();
  if (!s) return null;
  s = s.replace(/[^\d.,-]/g, ''); // quita moneda, letras, espacios
  if (!s) return null;
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  if (hasDot && hasComma) {
    // el último separador es el decimal
    s = s.lastIndexOf('.') > s.lastIndexOf(',') ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    // solo comas: decimal si hay una y deja 1-2 dígitos, si no son miles
    s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function pad2(v: string | number): string {
  return String(v).padStart(2, '0');
}

function toISODate(d: Date): string | null {
  if (!Number.isFinite(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/**
 * Devuelve fecha ISO `yyyy-mm-dd` o null. Formato ambiguo dd/mm vs mm/dd:
 * se asume dd/mm/yyyy (formato mexicano) salvo que el primer número sea > 12.
 */
export function parseDate(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return toISODate(value);
  if (typeof value === 'number') {
    // serial de Excel: días desde 1899-12-30
    return toISODate(new Date(Math.round((value - 25569) * 86400 * 1000)));
  }
  const s = String(value).trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;

  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let day = Number(m[1]);
    let month = Number(m[2]);
    if (day <= 12 && month > 12) [day, month] = [month, day]; // venía mm/dd
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  const parsed = new Date(s);
  return Number.isFinite(parsed.getTime()) ? toISODate(parsed) : null;
}

/** Texto limpio o null (para campos bancarios / banderas / observaciones). */
export function cleanText(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).replace(/\s+/g, ' ').trim();
  return s === '' ? null : s;
}

// ---------- Status ----------

const STATUS_ALIASES: Record<string, OperationStatus> = {
  COTIZACION: 'cotizacion',
  PROSPECTO: 'cotizacion',
  BORRADOR: 'cotizacion',
  PENDIENTE: 'pendiente',
  'POR ENVIAR': 'pendiente',
  NUEVO: 'pendiente',
  'EN PROCESO': 'en_proceso',
  PROCESANDO: 'en_proceso',
  'EN TRAMITE': 'en_proceso',
  'EN CURSO': 'en_proceso',
  ENVIADA: 'enviada',
  ENVIADO: 'enviada',
  PAGADA: 'enviada',
  PAGADO: 'enviada',
  'EN CAMINO': 'enviada',
  COMPLETADA: 'completada',
  COMPLETADO: 'completada',
  LIQUIDADA: 'completada',
  CONFIRMADA: 'completada',
  FINALIZADA: 'completada',
  OK: 'completada',
  CANCELADA: 'cancelada',
  CANCELADO: 'cancelada',
  REEMBOLSADA: 'reembolsada',
  REEMBOLSO: 'reembolsada',
  DEVUELTA: 'reembolsada',
  'CON INCIDENCIA': 'con_incidencia',
  INCIDENCIA: 'con_incidencia',
  RECHAZADA: 'con_incidencia',
  RECHAZADO: 'con_incidencia',
  PROBLEMA: 'con_incidencia',
  ERROR: 'con_incidencia',
};

/** Traduce el texto de la columna STATUS al enum de la app. Lo no reconocido → `pendiente`. */
export function mapStatus(value: unknown): { status: OperationStatus; matched: boolean } {
  const key = normalizeKey(value);
  if (!key) return { status: 'pendiente', matched: false };
  if (STATUS_ALIASES[key]) return { status: STATUS_ALIASES[key], matched: true };
  const asEnum = key.toLowerCase().replace(/ /g, '_') as OperationStatus;
  if (OPERATION_STATUSES.includes(asEnum)) return { status: asEnum, matched: true };
  return { status: 'pendiente', matched: false };
}

// ---------- Hash de deduplicación ----------

/**
 * Hash estable y síncrono (FNV-1a de 32 bits, duplicado, → 16 hex). NO es
 * criptográfico: solo necesita ser estable y con colisiones improbables
 * para deduplicar las filas de un cliente. Cuando la fila trae UETR, ese es
 * el identificador real y este hash no se usa.
 */
export function stableHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x01000193);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

// ---------- Normalización de una fila ----------

export interface NormalizedTransferRow {
  /** 1-based, contando solo filas de datos (sin el encabezado). */
  rowNumber: number;
  importKey: string;
  clientName: string | null;
  clientMatchKey: string | null;
  operationDate: string | null;
  status: OperationStatus;
  statusRaw: string | null;
  statusMatched: boolean;
  amountUsd: number | null;
  tc: number | null;
  concepto: string | null;
  observaciones: string | null;
  banking: {
    promotor: string | null;
    beneficiario: string | null;
    cuenta: string | null;
    banco: string | null;
    swift: string | null;
    bancoIntermediario: string | null;
    direccionBanco: string | null;
    direccionBeneficiario: string | null;
    taxId: string | null;
    uetr: string | null;
    flagAlta: string | null;
    flagCuentaConRecursos: string | null;
    flagFactura: string | null;
    flagPago: string | null;
  };
  /** Problemas que impiden importar la fila. Si está vacío, la fila es válida. */
  errors: string[];
  /** Avisos que no impiden importar (fecha ausente, status no reconocido, …). */
  warnings: string[];
}

export type RawRow = Record<string, unknown>;

/** Empareja los encabezados reales del archivo con los de la tabla del equipo. */
export function autoDetectMapping(headers: string[]): ColumnMapping {
  const byKey = new Map(headers.map((h) => [normalizeKey(h), h]));
  const mapping: ColumnMapping = {};
  for (const field of IMPORT_FIELDS) {
    const hit = byKey.get(normalizeKey(TEAM_SHEET_HEADERS[field]));
    if (hit) mapping[field] = hit;
  }
  return mapping;
}

function get(row: RawRow, mapping: ColumnMapping, field: ImportField): unknown {
  const col = mapping[field];
  return col ? row[col] : undefined;
}

export function normalizeRow(row: RawRow, mapping: ColumnMapping, index: number): NormalizedTransferRow {
  const errors: string[] = [];
  const warnings: string[] = [];

  const amountUsd = parseAmount(get(row, mapping, 'montoUsd'));
  if (amountUsd == null) errors.push('Monto USD vacío o no numérico.');
  else if (amountUsd <= 0) errors.push('Monto USD debe ser mayor a 0.');

  const clientName = cleanText(get(row, mapping, 'cliente'));
  if (!clientName) warnings.push('Sin cliente — se registra sin cliente asignado.');

  const operationDate = parseDate(get(row, mapping, 'fecha'));
  if (get(row, mapping, 'fecha') != null && get(row, mapping, 'fecha') !== '' && !operationDate) {
    warnings.push('Fecha no reconocida — se usará la fecha de hoy.');
  }

  const statusRaw = cleanText(get(row, mapping, 'status'));
  const { status, matched } = mapStatus(statusRaw);
  if (statusRaw && !matched) warnings.push(`Status "${statusRaw}" no reconocido — se deja en Pendiente.`);

  const tc = parseAmount(get(row, mapping, 'tc'));
  const uetr = cleanText(get(row, mapping, 'uetr'));
  const beneficiario = cleanText(get(row, mapping, 'beneficiario'));

  const importKey = uetr
    ? `uetr:${normalizeKey(uetr)}`
    : `h:${stableHash([operationDate ?? '', normalizeKey(clientName), amountUsd ?? '', normalizeKey(beneficiario), tc ?? ''].join('|'))}`;

  return {
    rowNumber: index + 1,
    importKey,
    clientName,
    clientMatchKey: clientName ? normalizeKey(clientName) : null,
    operationDate,
    status,
    statusRaw,
    statusMatched: matched,
    amountUsd,
    tc,
    concepto: cleanText(get(row, mapping, 'concepto')),
    observaciones: cleanText(get(row, mapping, 'observaciones')),
    banking: {
      promotor: cleanText(get(row, mapping, 'promotor')),
      beneficiario,
      cuenta: cleanText(get(row, mapping, 'cuenta')),
      banco: cleanText(get(row, mapping, 'banco')),
      swift: cleanText(get(row, mapping, 'swift')),
      bancoIntermediario: cleanText(get(row, mapping, 'bancoIntermediario')),
      direccionBanco: cleanText(get(row, mapping, 'direccionBanco')),
      direccionBeneficiario: cleanText(get(row, mapping, 'direccionBeneficiario')),
      taxId: cleanText(get(row, mapping, 'taxId')),
      uetr,
      flagAlta: cleanText(get(row, mapping, 'alta')),
      flagCuentaConRecursos: cleanText(get(row, mapping, 'cuentaConRecursos')),
      flagFactura: cleanText(get(row, mapping, 'factura')),
      flagPago: cleanText(get(row, mapping, 'pago')),
    },
    errors,
    warnings,
  };
}

export function normalizeRows(rows: RawRow[], mapping: ColumnMapping): NormalizedTransferRow[] {
  return rows.map((row, i) => normalizeRow(row, mapping, i));
}

// ---------- Fila normalizada → payload para create_transfer_operation ----------

export interface BuildPayloadOptions {
  createdBy: string;
  clientId: string | null;
  importSource: 'excel' | 'google_sheet' | 'drive_xlsx';
  importBatchId: string;
  /** Defaults ajustables por importación. */
  countryOrigin?: string;
  countryDestination?: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Construye `{ header, details }` tal como los espera el RPC
 * divisas.create_transfer_operation, corriendo el motor de cálculo (con
 * spread 0: buy_rate = sell_rate = 1, principal en USD).
 */
export function buildCreatePayload(row: NormalizedTransferRow, opts: BuildPayloadOptions) {
  const amount = row.amountUsd ?? 0;
  const calc: TransferResult = calcTransfer({ amountSent: amount, buyRate: 1, sellRate: 1 });

  const header = {
    client_id: opts.clientId,
    created_by: opts.createdBy,
    status: row.status,
    reference: row.concepto,
    observations: row.observaciones,
    operation_date: row.operationDate,
    import_source: opts.importSource,
    import_key: row.importKey,
    import_batch_id: opts.importBatchId,
    gross_revenue: toDisplayNumber(calc.grossRevenue),
    total_costs: toDisplayNumber(calc.totalCosts),
    gross_profit: toDisplayNumber(calc.grossProfit),
    net_profit: toDisplayNumber(calc.netProfit),
    margin_percent: toDisplayNumber(calc.marginPercent),
  };

  const details = {
    country_origin: opts.countryOrigin ?? 'México',
    country_destination: opts.countryDestination ?? 'Estados Unidos',
    currency_origin: 'USD',
    currency_destination: 'USD',
    amount_sent: amount,
    amount_received: toDisplayNumber(calc.amountReceived),
    exchange_rate_applied: 1,
    buy_rate: 1,
    sell_rate: 1,
    commission_fixed: 0,
    commission_percent: 0,
    commission_amount: 0,
    provider_cost: 0,
    bank_cost: 0,
    additional_cost: 0,
    spread_revenue: 0,
    promotor: row.banking.promotor,
    beneficiary_name: row.banking.beneficiario,
    beneficiary_account: row.banking.cuenta,
    beneficiary_bank: row.banking.banco,
    beneficiary_swift: row.banking.swift,
    intermediary_bank: row.banking.bancoIntermediario,
    bank_address: row.banking.direccionBanco,
    beneficiary_address: row.banking.direccionBeneficiario,
    beneficiary_tax_id: row.banking.taxId,
    uetr: row.banking.uetr,
    tc_reference: row.tc,
    amount_mxn: row.tc != null ? round2(amount * row.tc) : null,
    flag_alta: row.banking.flagAlta,
    flag_cuenta_con_recursos: row.banking.flagCuentaConRecursos,
    flag_factura: row.banking.flagFactura,
    flag_pago: row.banking.flagPago,
  };

  return { header, details };
}
