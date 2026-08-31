#!/usr/bin/env -S npx tsx
/**
 * Clasifica las filas de PAGO del estado de cuenta que NO casaron con una
 * operación importada: ¿es una operación que falta, o solo el nombre no
 * empata? Uso: npx tsx scripts/analizar-faltantes.mts "<ruta .xlsx>"
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { read, utils } from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { normalizeKey, parseAmount, parseDate } from '../src/lib/import/transfer-import';

const filePath = process.argv[2];
if (!filePath) { console.error('falta la ruta'); process.exit(1); }

const benefKey = (s: unknown) =>
  normalizeKey(s)
    .replace(/[.,"'`()]/g, ' ')
    .replace(/\b(CO|LTD|LTDA|LIMITED|INC|LLC|CORP|CORPORATION|INTERNATIONAL|INTL|INDUSTRIAL|IMPORT|EXPORT|IMPT|EXPT|INDUSTRY|TRADE|TRADING|INDUSTRIES|COMPANY|GMBH|SA|SL|SRL|SPA)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  db: { schema: 'divisas' }, auth: { persistSession: false },
});

const wb = read(readFileSync(filePath), { cellDates: true });
type Row = { sheet: string; nombre: string; usd: number; date: string | null };
const stmt: Row[] = [];
for (const sheetName of wb.SheetNames) {
  const aoa = utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, raw: true, defval: '', blankrows: false });
  let hdr = -1;
  for (let i = 0; i < Math.min(aoa.length, 8); i++) {
    const k = (aoa[i] ?? []).map((c) => normalizeKey(c));
    if (k.includes('NOMBRE') && k.includes('USD')) { hdr = i; break; }
  }
  if (hdr < 0) continue;
  const H = (aoa[hdr] ?? []).map((c) => normalizeKey(c));
  const ci = (n: string) => H.indexOf(n);
  for (let i = hdr + 1; i < aoa.length; i++) {
    const r = aoa[i] ?? [];
    const usd = parseAmount(r[ci('USD')]);
    const tc = parseAmount(r[ci('TC')]) ?? 0;
    if (!usd || usd <= 0 || tc <= 0) continue;
    const nombre = String(r[ci('NOMBRE')] ?? '').trim();
    if (!nombre || /SALDO INICIAL/i.test(nombre)) continue;
    const concepto = normalizeKey(ci('CONCEPTO') >= 0 ? r[ci('CONCEPTO')] : '');
    if (concepto.includes('DEVOLUC') || concepto.includes('DEPOSITO') || concepto === 'SALDO') continue;
    stmt.push({ sheet: sheetName, nombre, usd, date: parseDate(ci('FECHA DE OPERACION') >= 0 ? r[ci('FECHA DE OPERACION')] : null) });
  }
}

const { data: ops } = await db
  .from('operations')
  .select('operation_date, international_transfers(beneficiary_name, amount_sent)')
  .eq('module', 'transferencia').not('import_source', 'is', null);

const byBenef = new Map<string, number[]>();
const allBenefKeys = new Set<string>();
for (const o of ops ?? []) {
  const t = (o as any).international_transfers;
  if (!t?.beneficiary_name) continue;
  const k = benefKey(t.beneficiary_name);
  allBenefKeys.add(k);
  const arr = byBenef.get(k) ?? [];
  arr.push(Number(t.amount_sent));
  byBenef.set(k, arr);
}

let noExiste = 0, existeOtroMonto = 0, byMonth: Record<string, number> = {};
const ejNoExiste: string[] = [];
for (const s of stmt) {
  const k = benefKey(s.nombre);
  const amts = byBenef.get(k);
  const casa = amts?.some((a) => Math.abs(a - s.usd) < 1);
  if (casa) continue;
  const m = (s.date ?? '????-??').slice(0, 7);
  byMonth[m] = (byMonth[m] ?? 0) + 1;
  if (!amts) {
    noExiste++;
    if (ejNoExiste.length < 15) ejNoExiste.push(`${s.date ?? '?'}  ${s.usd} USD  ${s.nombre}  [${s.sheet}]`);
  } else {
    existeOtroMonto++;
  }
}

console.log(`Filas de PAGO en el estado de cuenta:            ${stmt.length}`);
console.log(`Beneficiario NO existe en operaciones (faltan):  ${noExiste}`);
console.log(`Beneficiario sí existe, monto no empata:         ${existeOtroMonto}`);
console.log(`\nFaltantes por mes:`, JSON.stringify(Object.fromEntries(Object.entries(byMonth).sort())));
console.log(`\nEjemplos de operaciones que faltan (beneficiario que NO está en el sistema):`);
for (const e of ejNoExiste) console.log('  ' + e);
