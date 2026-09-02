/**
 * Lectura del "Libro de transferencias" — control diario de septiembre 2026 en
 * adelante. Una fila por transferencia: el cliente entrega pesos
 * (MONTO RECIBIDO) y el beneficiario recibe dólares (MONTO USD), ruta
 * México → Estados Unidos.
 *
 * El archivo lo lleva una persona a mano y algunas filas traen una columna
 * corrida (les falta la celda "COMISIÓN 1% CP"), así que NO se recalcula la
 * utilidad: se toma la columna TOTAL CASA tal cual del Excel. Para ubicarla
 * sin depender del índice de columna, se ancla en la celda CUENTA (código
 * "P19", "P22"…): TOTAL CASA es la celda numérica inmediatamente anterior.
 *
 *   COSTO DE OPERACIÓN = MONTO USD × TIPO DE CAMBIO COMPRA   (ancla izquierda)
 *   DIFERENCIA (spread) = MONTO RECIBIDO − COSTO DE OPERACIÓN
 *   TOTAL CASA = utilidad de EA, del Excel                    (ancla derecha)
 *   costos    = DIFERENCIA − TOTAL CASA  (comisión al comisionista + al banco)
 *
 * Solo depende de transfer-import.ts, así que sirve en frontend y en el
 * script de sincronización (scripts/sync-libro-transferencias.mts).
 */
import { normalizeKey, parseAmount, parseDate } from './transfer-import.ts';

export interface LibroSheet {
  name: string;
  aoa: unknown[][];
}

export interface LibroPago {
  date: string; // yyyy-mm-dd (nunca null: se omiten las filas sin fecha)
  client: string;
  account: string | null; // columna CUENTA (P19, P22, …)
  usd: number; // MONTO USD — lo que recibe el beneficiario
  mxnReceived: number; // MONTO RECIBIDO — lo que entrega el cliente
  tcCompra: number; // TIPO DE CAMBIO COMPRA
  tcVenta: number; // MONTO RECIBIDO / MONTO USD (tipo de cambio efectivo al cliente)
  costoOperacion: number; // MONTO USD × TC COMPRA
  spread: number; // DIFERENCIA = MONTO RECIBIDO − COSTO DE OPERACIÓN
  totalCosts: number; // DIFERENCIA − TOTAL CASA (comisiones de comisionista y banco)
  totalCasa: number; // utilidad de EA — columna TOTAL CASA del Excel, sin recalcular
}

const HEADER_HINTS = ['MONTO USD', 'MONTO RECIBIDO', 'TIPO DE CAMBIO COMPRA'];
const ACCOUNT_RE = /^\s*P\s*\d/i;

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** ¿El archivo tiene pinta de "libro de transferencias"? */
export function looksLikeLibroTransferencias(sheets: LibroSheet[]): boolean {
  return sheets.some((s) =>
    s.aoa.slice(0, 10).some((row) => {
      const k = (row ?? []).map((c) => normalizeKey(c));
      return HEADER_HINTS.every((h) => k.includes(h));
    }),
  );
}

/** Llave estable de una transferencia, para no duplicar al re-leer el archivo. */
export function libroImportKey(p: LibroPago): string {
  return `lt:${normalizeKey(p.client)}|${Math.round(p.usd * 100)}|${Math.round(p.mxnReceived * 100)}|${p.date}|${normalizeKey(p.account ?? '')}`;
}

export function parseLibroTransferencias(sheets: LibroSheet[]): LibroPago[] {
  const out: LibroPago[] = [];
  const seen = new Set<string>();
  const thisYear = new Date().getFullYear();

  for (const sheet of sheets) {
    const aoa = sheet.aoa;
    let hdr = -1;
    for (let i = 0; i < Math.min(aoa.length, 10); i++) {
      const k = (aoa[i] ?? []).map((c) => normalizeKey(c));
      if (HEADER_HINTS.every((h) => k.includes(h))) {
        hdr = i;
        break;
      }
    }
    if (hdr < 0) continue;

    const H = (aoa[hdr] ?? []).map((c) => normalizeKey(c));
    const ci = (n: string) => H.indexOf(n);
    const iFecha = ci('FECHA');
    const iCliente = ci('CLIENTE');
    const iRecibido = ci('MONTO RECIBIDO');
    const iUsd = ci('MONTO USD');
    const iTcC = ci('TIPO DE CAMBIO COMPRA');
    const iCosto = ci('COSTO DE OPERACION');
    const iDif = ci('DIFERENCIA');
    const iCuenta = ci('CUENTA');
    // columnas de costo — solo para el respaldo cuando no hay ancla CUENTA
    const iCostCols = ['COMISION 1% CP', 'COMISIONES CP', 'COMISIONES BANKAOOL', 'COMIS COMISIONISTA']
      .map((n) => ci(n))
      .filter((x) => x >= 0);

    for (let i = hdr + 1; i < aoa.length; i++) {
      const r = aoa[i] ?? [];
      const usd = parseAmount(r[iUsd]);
      const mxn = parseAmount(r[iRecibido]);
      // filas de sección ("SEPTIEMBRE", "OCTUBRE"…) o vacías: sin montos
      if (!usd || usd <= 0 || !mxn || mxn <= 0) continue;
      let date = parseDate(iFecha >= 0 ? r[iFecha] : null);
      if (!date) continue;
      if (Number(date.slice(0, 4)) > thisYear) date = `${thisYear}${date.slice(4)}`;
      const client = String(r[iCliente] ?? '').trim();
      if (!client) continue;

      const tcCompra = parseAmount(iTcC >= 0 ? r[iTcC] : null) ?? 0;
      const costoOperacion = r4(parseAmount(iCosto >= 0 ? r[iCosto] : null) ?? usd * tcCompra);
      const spread = r4(parseAmount(iDif >= 0 ? r[iDif] : null) ?? mxn - costoOperacion);
      const tcVenta = r4(mxn / usd);

      // Ancla derecha: la celda CUENTA ("P19"…). TOTAL CASA es la numérica
      // justo antes — funciona aunque la fila tenga una columna corrida.
      let accountAt = -1;
      for (let c = Math.max(iDif + 1, iCuenta - 3, 0); c < r.length; c++) {
        if (ACCOUNT_RE.test(String(r[c] ?? '').trim())) {
          accountAt = c;
          break;
        }
      }
      let account: string | null = null;
      let totalCasa = NaN;
      if (accountAt > 0) {
        account = String(r[accountAt]).trim();
        totalCasa = r2(parseAmount(r[accountAt - 1]) ?? NaN);
      }
      if (!Number.isFinite(totalCasa)) {
        // sin ancla: asumir el layout alineado y restar las columnas de costo
        const costs = iCostCols.reduce((s, c) => s + (parseAmount(r[c]) ?? 0), 0);
        totalCasa = r2(spread - costs);
        if (accountAt < 0 && iCuenta >= 0) account = String(r[iCuenta] ?? '').trim() || null;
      }
      const totalCosts = r2(spread - totalCasa);

      const p: LibroPago = {
        date,
        client,
        account,
        usd,
        mxnReceived: mxn,
        tcCompra,
        tcVenta,
        costoOperacion,
        spread,
        totalCosts,
        totalCasa,
      };
      const key = libroImportKey(p);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

/** Fila del libro → { header, details } para el RPC divisas.create_transfer_operation. */
export function libroToTransferPayload(
  p: LibroPago,
  opts: { createdBy: string; clientId: string | null; importBatchId: string },
) {
  const util = r2(p.totalCasa);
  const costs = r2(p.totalCosts);
  const margin = p.mxnReceived ? r2((util / p.mxnReceived) * 100) : 0;

  return {
    header: {
      client_id: opts.clientId,
      created_by: opts.createdBy,
      status: 'completada',
      operation_date: p.date,
      import_source: 'excel',
      import_key: libroImportKey(p),
      import_batch_id: opts.importBatchId,
      gross_revenue: r2(p.spread),
      total_costs: costs,
      gross_profit: r2(p.spread),
      net_profit: util,
      margin_percent: margin,
    },
    details: {
      country_origin: 'México',
      country_destination: 'Estados Unidos',
      currency_origin: 'USD',
      currency_destination: 'MXN',
      amount_sent: p.usd,
      amount_received: r2(p.mxnReceived),
      exchange_rate_applied: p.tcVenta,
      buy_rate: p.tcCompra,
      sell_rate: p.tcVenta,
      commission_fixed: 0,
      commission_percent: 0,
      commission_amount: 0,
      provider_cost: 0,
      bank_cost: 0,
      additional_cost: costs,
      spread_revenue: r2(p.spread),
      tc_reference: p.tcVenta,
      amount_mxn: r2(p.mxnReceived),
    },
  };
}
