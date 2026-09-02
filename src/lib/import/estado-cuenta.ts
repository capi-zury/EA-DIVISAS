/**
 * Lectura del "ESTADO DE CUENTA CLIENTES" — una hoja por cliente, formato
 * libro mayor. Extrae las operaciones de PAGO (transferencia).
 *
 * Reglamento de utilidad (acordado con el negocio, ver README
 * §"Importación de transferencias"):
 *   1. La COMISIÓN (columna COM $, o COM % × TOTAL) es lo que gana EA "de
 *      entrada". La hoja casi siempre la trae.
 *   2. El SPREAD cambiario — USD × (TC venta − TC compra) — solo se suma
 *      cuando la hoja trae TC de compra Y de venta con datos completos.
 *   3. Cuando NO hay TC de compra, se iguala al de venta (spread 0) y no se
 *      suma nada por diferencia de tipo de cambio. No se usa la columna
 *      DIFERENCIA de la hoja como fuente: suele venir sin el TC de compra
 *      restado y trae el monto completo.
 * El monto en pesos (USD × TC de venta) sí se copia tal cual del Excel.
 *
 * Compartido frontend (asistente de importación) / servidor (Edge Function).
 */
import { normalizeKey, parseAmount, parseDate } from './transfer-import.ts';

export interface EcPago {
  client: string;
  beneficiary: string;
  usd: number;
  tcVenta: number;
  tcCompra: number; // = tcVenta cuando la hoja no trae un TC de compra válido
  comPct: number;
  comUsd: number; // COM $ del Excel (pesos) — utilidad "de entrada"
  totalVenta: number; // USD × TC de venta
  // `spread` / `ratesComplete` los produce siempre parseEstadoCuenta; son
  // opcionales solo porque un payload de un cliente viejo puede no traerlos
  // (el servidor deriva `spread` de diferencia − comisión en ese caso).
  spread?: number; // USD × (TC venta − TC compra); 0 si la hoja no trae ambos TC
  diferencia: number; // ganancia de EA en la fila = comisión + spread
  ratesComplete?: boolean; // la hoja traía TC de compra y de venta con datos
  date: string; // yyyy-mm-dd (nunca null: se omiten las filas sin fecha)
}

export interface EcSheet {
  name: string;
  aoa: unknown[][];
}

const clientFromSheet = (name: string) =>
  name
    .replace(/^P\s*[\dxX]+\s*[-–]\s*/i, '')
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/[-–]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** ¿El archivo tiene pinta de estado de cuenta? (alguna hoja con NOMBRE + USD + TC) */
export function looksLikeEstadoCuenta(sheets: EcSheet[]): boolean {
  return sheets.some((s) => {
    for (let i = 0; i < Math.min(s.aoa.length, 8); i++) {
      const k = (s.aoa[i] ?? []).map((c) => normalizeKey(c));
      if (k.includes('NOMBRE') && k.includes('USD') && k.includes('TC')) return true;
    }
    return false;
  });
}

/** Llave estable de una operación para no duplicar al re-subir el archivo. */
export function ecImportKey(p: EcPago): string {
  return `h:${normalizeKey(p.beneficiary)}|${Math.round(p.usd * 100)}|${p.date}|${normalizeKey(p.client)}`;
}

export function parseEstadoCuenta(sheets: EcSheet[]): EcPago[] {
  const pagos: EcPago[] = [];
  const seen = new Set<string>();
  const thisYear = new Date().getFullYear();

  for (const sheet of sheets) {
    const aoa = sheet.aoa;
    let hdr = -1;
    for (let i = 0; i < Math.min(aoa.length, 8); i++) {
      const k = (aoa[i] ?? []).map((c) => normalizeKey(c));
      if (k.includes('NOMBRE') && k.includes('USD') && k.includes('TC')) {
        hdr = i;
        break;
      }
    }
    if (hdr < 0) continue;
    const H = (aoa[hdr] ?? []).map((c) => normalizeKey(c));
    const ci = (n: string) => H.indexOf(n);
    const client = clientFromSheet(sheet.name) || sheet.name.trim();

    for (let i = hdr + 1; i < aoa.length; i++) {
      const r = aoa[i] ?? [];
      const usd = parseAmount(r[ci('USD')]);
      const tcVenta = parseAmount(r[ci('TC')]) ?? 0;
      if (!usd || usd <= 0 || tcVenta < 5 || tcVenta > 40) continue;
      const nombre = String(r[ci('NOMBRE')] ?? '').trim();
      if (!nombre || /SALDO INICIAL/i.test(nombre)) continue;
      const concepto = normalizeKey(ci('CONCEPTO') >= 0 ? r[ci('CONCEPTO')] : '');
      if (concepto.includes('DEVOLUC') || concepto.includes('DEPOSITO') || concepto === 'SALDO') continue;

      let date =
        parseDate(ci('FECHA DE OPERACION') >= 0 ? r[ci('FECHA DE OPERACION')] : null) ??
        parseDate(ci('FECHA DE CIERRE') >= 0 ? r[ci('FECHA DE CIERRE')] : null);
      if (!date) continue;
      if (Number(date.slice(0, 4)) > thisYear) date = `${thisYear}${date.slice(4)}`;

      const dedupKey = `${normalizeKey(nombre)}|${Math.round(usd * 100)}|${date}|${normalizeKey(client)}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      let comPct = parseAmount(ci('COM %') >= 0 ? r[ci('COM %')] : null) ?? 0;
      if (comPct > 0.06 || comPct < 0) comPct = 0;

      const totalVenta = Math.round(usd * tcVenta * 10000) / 10000;

      // 1. Comisión: lo que gana EA "de entrada". COM $ tal cual, o COM % × TOTAL.
      const idxCom = ci('COM $');
      let comUsd = idxCom >= 0 ? parseAmount(r[idxCom]) ?? 0 : 0;
      if (!comUsd && comPct) comUsd = Math.round(totalVenta * comPct * 10000) / 10000;

      // 2. Spread: solo si la hoja trae TC de compra Y de venta con datos.
      //    Sin TC de compra válido se iguala al de venta (spread 0) y no se
      //    suma nada por diferencia de tipo de cambio (tampoco la columna
      //    DIFERENCIA, que a menudo viene sin el TC de compra restado).
      const rawTcCompra = parseAmount(ci('TC COMPRA') >= 0 ? r[ci('TC COMPRA')] : null);
      const ratesComplete = rawTcCompra != null && rawTcCompra >= 5 && rawTcCompra <= 40;
      const tcCompra = ratesComplete ? rawTcCompra : tcVenta;
      const spread = ratesComplete ? Math.round(usd * (tcVenta - tcCompra) * 10000) / 10000 : 0;

      // 3. Ganancia de EA en la fila = comisión + spread.
      const diferencia = Math.round((comUsd + spread) * 10000) / 10000;

      pagos.push({
        client,
        beneficiary: nombre,
        usd,
        tcVenta,
        tcCompra,
        comPct,
        comUsd,
        totalVenta,
        spread,
        diferencia,
        ratesComplete,
        date,
      });
    }
  }
  return pagos;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Fila del estado de cuenta → { header, details } para create_transfer_operation. */
export function ecToTransferPayload(
  p: EcPago,
  opts: { createdBy: string; clientId: string | null; importBatchId: string },
) {
  const comision = r2(p.comUsd);
  // `spread` puede faltar si el payload viene de un cliente viejo: se deriva
  // de la ganancia total menos la comisión (comportamiento anterior).
  const spread = r2(p.spread ?? p.diferencia - p.comUsd);
  const util = r2(comision + spread);
  const margin = p.totalVenta ? r2((util / p.totalVenta) * 100) : 0;

  return {
    header: {
      client_id: opts.clientId,
      created_by: opts.createdBy,
      status: 'completada',
      operation_date: p.date,
      import_source: 'excel',
      import_key: ecImportKey(p),
      import_batch_id: opts.importBatchId,
      gross_revenue: util,
      total_costs: 0,
      gross_profit: util,
      net_profit: util,
      margin_percent: margin,
    },
    details: {
      country_origin: 'México',
      country_destination: 'Estados Unidos',
      currency_origin: 'USD',
      currency_destination: 'MXN',
      amount_sent: p.usd,
      amount_received: r2(p.totalVenta),
      exchange_rate_applied: p.tcVenta,
      buy_rate: p.tcCompra,
      sell_rate: p.tcVenta,
      commission_fixed: comision,
      commission_percent: p.comPct * 100,
      commission_amount: comision,
      provider_cost: 0,
      bank_cost: 0,
      additional_cost: 0,
      spread_revenue: spread,
      tc_reference: p.tcVenta,
      amount_mxn: r2(p.usd * p.tcVenta),
    },
  };
}
