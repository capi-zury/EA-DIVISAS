#!/usr/bin/env -S npx tsx
/**
 * Corrige la fecha de las transferencias ya importadas cuyo día/mes quedó
 * invertido (el Excel las mostraba en formato mes/día). Lee el archivo,
 * recalcula la fecha bien (Date real, sin ambigüedad) y actualiza solo las
 * filas que cambian, buscándolas por su import_key original.
 *
 * Uso:  npx tsx scripts/resync-imported-dates.mts "<ruta al .xlsx>" [hoja]
 *       hoja por defecto: PAGOS
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { read, utils } from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import {
  autoDetectMapping,
  normalizeKey,
  normalizeRow,
  parseAmount,
  parseDate,
  stableHash,
  type RawRow,
} from '../src/lib/import/transfer-import';

const filePath = process.argv[2];
const sheetName = process.argv[3] ?? 'PAGOS';
if (!filePath) {
  console.error('Uso: npx tsx scripts/resync-imported-dates.mts "<ruta .xlsx>" [hoja]');
  process.exit(1);
}

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  db: { schema: 'divisas' },
  auth: { persistSession: false },
});

const buf = readFileSync(filePath);
const wb = read(buf, { cellDates: true });
const good = utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, raw: true, defval: '', blankrows: false });
const bad = utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, raw: false, defval: '', blankrows: false });

// fila de encabezados = la que más coincide con la tabla del equipo
const teamKeys = new Set(
  Object.values(
    (await import('../src/lib/import/transfer-import')).TEAM_SHEET_HEADERS,
  ).map(normalizeKey),
);
let hdr = 0;
let best = -1;
for (let i = 0; i < Math.min(good.length, 15); i++) {
  const s = (good[i] ?? []).map((c) => normalizeKey(c)).filter((c) => teamKeys.has(c)).length;
  if (s > best) {
    best = s;
    hdr = i;
  }
}

const headers = (good[hdr] ?? []).map((h, i) => String(h ?? '').trim() || `Columna ${i + 1}`);
const mapping = autoDetectMapping(headers);
const col = (field: 'fecha' | 'cliente' | 'montoUsd' | 'beneficiario' | 'tc' | 'uetr') =>
  headers.indexOf(mapping[field] ?? '');

let changed = 0;
let updated = 0;
let notFound = 0;

for (let i = hdr + 1; i < good.length; i++) {
  const obj: RawRow = {};
  headers.forEach((h, c) => (obj[h] = good[i]?.[c] ?? ''));
  const nr = normalizeRow(obj, mapping, i - hdr - 1);
  const newDate = nr.operationDate;
  const oldDate = parseDate(bad[i]?.[col('fecha')]);
  if (!newDate || newDate === oldDate) continue;
  changed++;

  const client = normalizeKey(String(good[i]?.[col('cliente')] ?? ''));
  const amount = parseAmount(good[i]?.[col('montoUsd')]);
  const benef = normalizeKey(String(good[i]?.[col('beneficiario')] ?? ''));
  const tc = parseAmount(good[i]?.[col('tc')]);
  const uetr = String(good[i]?.[col('uetr')] ?? '').trim();

  const oldKey = uetr
    ? `uetr:${normalizeKey(uetr)}`
    : `h:${stableHash([oldDate ?? '', client, amount ?? '', benef, tc ?? ''].join('|'))}`;

  const { data: op } = await db.from('operations').select('id, folio, operation_date').eq('import_key', oldKey).maybeSingle();
  if (!op) {
    notFound++;
    console.log(`  sin match: fila ${i + 1}  ${oldDate} → ${newDate}`);
    continue;
  }
  const { error } = await db
    .from('operations')
    .update({ operation_date: newDate, import_key: nr.importKey })
    .eq('id', op.id);
  if (error) console.error(`  ${op.folio}: ${error.message}`);
  else {
    updated++;
    console.log(`  ${op.folio}: ${op.operation_date} → ${newDate}`);
  }
}

console.log(`\nfilas con fecha corregida en el archivo: ${changed}`);
console.log(`operaciones actualizadas: ${updated}`);
if (notFound) console.log(`sin coincidencia (revisar a mano): ${notFound}`);
