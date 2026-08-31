/**
 * Lectura del "ESTADO DE CUENTA CLIENTES" — una hoja por cliente, formato
 * libro mayor. Extrae las operaciones de PAGO (transferencia) copiando los
 * números que el Excel ya calculó (columnas TOTAL, COM $, DIFERENCIA), sin
 * recalcular, para que la app nunca muestre cifras distintas al Excel.
 *
 * Compartido frontend (asistente de importación) / servidor (Edge Function).
 */
import { normalizeKey, parseAmount, parseDate } from './transfer-import';

export interface EcPago {
  client: string;
  beneficiary: string;
  usd: number;
  tcVenta: number;
  tcCompra: number;
  comPct: number;
  comUsd: number; // COM $ del Excel (pesos)
  totalVenta: number; // USD × TC
  diferencia: number; // ganancia de EA = columna DIFERENCIA (spread + comisión)
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

      let tcCompra = parseAmount(ci('TC COMPRA') >= 0 ? r[ci('TC COMPRA')] : null) ?? 0;
      if (tcCompra < 5 || tcCompra > 40) tcCompra = tcVenta;
      let comPct = parseAmount(ci('COM %') >= 0 ? r[ci('COM %')] : null) ?? 0;
      if (comPct > 0.06 || comPct < 0) comPct = 0;

      const totalVenta = Math.round(usd * tcVenta * 10000) / 10000;
      const idxDif = [ci('DIFERENCIA'), ci('DIF DE TC VENTA Y TC COMPRA')].find((x) => x >= 0) ?? -1;
      const idxCom = ci('COM $');
      let comUsd = idxCom >= 0 ? parseAmount(r[idxCom]) ?? 0 : 0;
      if (!comUsd && comPct) comUsd = Math.round(totalVenta * comPct * 10000) / 10000;

      let diferencia = idxDif >= 0 ? parseAmount(r[idxDif]) ?? NaN : NaN;
      const fallbackDif = Math.round((usd * (tcVenta - tcCompra) + comUsd) * 10000) / 10000;
      // si la columna DIFERENCIA viene sin TC COMPRA restado, trae el monto
      // completo — una ganancia real es < 20% del TOTAL.
      if (!Number.isFinite(diferencia) || Math.abs(diferencia) > totalVenta * 0.2) diferencia = fallbackDif;

      pagos.push({
        client,
        beneficiary: nombre,
        usd,
        tcVenta,
        tcCompra,
        comPct,
        comUsd,
        totalVenta,
        diferencia,
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
  const util = r2(p.diferencia);
  const comision = r2(p.comUsd);
  const spread = r2(p.diferencia - p.comUsd);
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
