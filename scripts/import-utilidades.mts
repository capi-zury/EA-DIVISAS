#!/usr/bin/env -S npx tsx
/**
 * Trae la utilidad de cada transferencia desde el "ESTADO DE CUENTA
 * CLIENTES" (una hoja por cliente) y la mete en la operación ya importada.
 *
 *   utilidad_mxn = COM$  +  USD * (TC - TC_COMPRA)
 *
 * Casa por beneficiario (NOMBRE) + monto USD, con la fecha como desempate.
 * La utilidad se guarda como "comisión cobrada" (commission_fixed): el
 * motor de cálculo entonces produce net_profit = utilidad, sin tocar el
 * modelo de la operación.
 *
 * Uso:  npx tsx scripts/import-utilidades.mts "<ruta .xlsx>" [--apply]
 *       sin --apply solo reporta (dry-run).
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { read, utils } from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { normalizeKey, parseAmount, parseDate } from '../src/lib/import/transfer-import';

/** Clave de beneficiario tolerante: sin acentos, sin puntuación, sin sufijos societarios. */
const benefKey = (s: unknown) =>
  normalizeKey(s)
    .replace(/[.,"'`()]/g, ' ')
    .replace(/\b(CO|LTD|LTDA|LIMITED|INC|LLC|CORP|CORPORATION|INTERNATIONAL|INTL|INDUSTRIAL|IMPORT|EXPORT|IMPT|EXPT|INDUSTRY|TRADE|TRADING|INDUSTRIES|COMPANY|GMBH|SA|SL|SRL|SPA)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const filePath = process.argv[2];
const APPLY = process.argv.includes('--apply');
if (!filePath) {
  console.error('Uso: npx tsx scripts/import-utilidades.mts "<ruta .xlsx>" [--apply]');
  process.exit(1);
}

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  db: { schema: 'divisas' },
  auth: { persistSession: false },
});

// ---- 1) leer todas las filas de "PAGO" del estado de cuenta ----
type StmtRow = { beneficiary: string; usd: number; date: string | null; utilidad: number; sheet: string; row: number };
const wb = read(readFileSync(filePath), { cellDates: true });
const stmt: StmtRow[] = [];

for (const sheetName of wb.SheetNames) {
  const aoa = utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, raw: true, defval: '', blankrows: false });
  // fila de encabezados: la que trae "NOMBRE" y "USD"
  let hdr = -1;
  for (let i = 0; i < Math.min(aoa.length, 8); i++) {
    const keys = (aoa[i] ?? []).map((c) => normalizeKey(c));
    if (keys.includes('NOMBRE') && keys.includes('USD')) {
      hdr = i;
      break;
    }
  }
  if (hdr < 0) continue;
  const H = (aoa[hdr] ?? []).map((c) => normalizeKey(c));
  const col = (name: string) => H.indexOf(name);
  const cNombre = col('NOMBRE');
  const cUsd = col('USD');
  const cTc = col('TC');
  const cTcC = col('TC COMPRA');
  const cComPct = col('COM %');
  const cComUsd = col('COM $');
  const cFecha = col('FECHA DE OPERACION');
  const cConcepto = col('CONCEPTO');
  const cTipoCargo = col('TIPO CARGO');

  for (let i = hdr + 1; i < aoa.length; i++) {
    const r = aoa[i] ?? [];
    const usd = parseAmount(r[cUsd]);
    if (!usd || usd <= 0) continue;
    const nombre = String(r[cNombre] ?? '').trim();
    if (!nombre || /SALDO INICIAL/i.test(nombre)) continue;
    // filtro explícito de NO-pagos cuando la hoja sí trae CONCEPTO
    const concepto = normalizeKey(cConcepto >= 0 ? r[cConcepto] : '');
    if (concepto && (concepto.includes('DEVOLUC') || concepto.includes('DEPOSITO') || concepto === 'SALDO')) continue;
    void cTipoCargo;

    const tc = parseAmount(r[cTc]) ?? 0;
    if (tc <= 0) continue; // sin tipo de cambio no hubo pago al extranjero
    const tcC = parseAmount(cTcC >= 0 ? r[cTcC] : null) ?? 0;
    let com = parseAmount(cComUsd >= 0 ? r[cComUsd] : null) ?? 0;
    if (!com) {
      const pct = parseAmount(cComPct >= 0 ? r[cComPct] : null) ?? 0;
      com = usd * tc * pct; // COM% suele venir como fracción (0.005)
    }
    const spread = tcC > 0 && tc > 0 ? usd * (tc - tcC) : 0;
    const utilidad = Math.round((com + spread) * 100) / 100;
    if (utilidad === 0) continue;

    stmt.push({
      beneficiary: nombre,
      usd,
      date: parseDate(cFecha >= 0 ? r[cFecha] : null),
      utilidad,
      sheet: sheetName,
      row: i + 1,
    });
  }
}

console.log(`Filas de PAGO con utilidad en el estado de cuenta: ${stmt.length}`);

// ---- 2) traer las transferencias importadas ----
const { data: ops, error } = await db
  .from('operations')
  .select('id, folio, operation_date, net_profit, international_transfers(beneficiary_name, amount_sent, amount_received, commission_fixed)')
  .eq('module', 'transferencia')
  .not('import_source', 'is', null);
if (error) throw error;

const byBenef = new Map<string, any[]>();
for (const o of ops ?? []) {
  const t = (o as any).international_transfers;
  if (!t?.beneficiary_name) continue;
  const k = benefKey(t.beneficiary_name);
  const arr = byBenef.get(k) ?? [];
  arr.push(o);
  byBenef.set(k, arr);
}

// ---- 3) casar ----
let matched = 0;
let ambiguous = 0;
let notFound = 0;
let updated = 0;
const usedOps = new Set<string>();

const daysApart = (a: string | null, b: string | null) =>
  a && b ? Math.abs((+new Date(a) - +new Date(b)) / 86400000) : 999;

const unmatchedSamples: string[] = [];
for (const s of stmt) {
  const cands = (byBenef.get(benefKey(s.beneficiary)) ?? []).filter((o) => {
    const t = (o as any).international_transfers;
    return !usedOps.has(o.id) && Math.abs(Number(t.amount_sent) - s.usd) < 1;
  });

  let pick: any = null;
  if (cands.length === 1) pick = cands[0];
  else if (cands.length > 1) {
    cands.sort((a, b) => daysApart(a.operation_date, s.date) - daysApart(b.operation_date, s.date));
    if (daysApart(cands[0].operation_date, s.date) <= 10) pick = cands[0];
    else {
      ambiguous++;
      continue;
    }
  }

  if (!pick) {
    notFound++;
    if (unmatchedSamples.length < 12) unmatchedSamples.push(`${s.sheet} f${s.row}: "${s.beneficiary}" ${s.usd} USD ${s.date ?? '?'} → util ${s.utilidad}`);
    continue;
  }
  matched++;
  usedOps.add(pick.id);

  if (APPLY) {
    const t = (pick as any).international_transfers;
    const amountReceived = Number(t.amount_received) || s.usd;
    const margin = amountReceived ? Math.round((s.utilidad / amountReceived) * 10000) / 100 : 0;
    const { error: e1 } = await db
      .from('operations')
      .update({
        gross_revenue: s.utilidad,
        gross_profit: s.utilidad,
        net_profit: s.utilidad,
        margin_percent: margin,
      })
      .eq('id', pick.id);
    const { error: e2 } = await db
      .from('international_transfers')
      .update({ commission_fixed: s.utilidad, commission_amount: s.utilidad })
      .eq('operation_id', pick.id);
    if (e1 || e2) console.error(`  ${pick.folio}: ${e1?.message ?? ''} ${e2?.message ?? ''}`);
    else updated++;
  }
}

console.log(`\ncasadas:      ${matched}`);
console.log(`sin encontrar: ${notFound}`);
console.log(`ambiguas:     ${ambiguous}`);
if (APPLY) console.log(`actualizadas: ${updated}`);
else {
  console.log('\nejemplos sin casar:');
  for (const u of unmatchedSamples) console.log('  ' + u);
  console.log('\n(prueba — corre otra vez con --apply para guardar)');
}
