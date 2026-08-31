#!/usr/bin/env -S npx tsx
/**
 * Importa las operaciones de EFECTIVO desde
 * "Copia de OPERACIONES zury EFECTIVO 2026".
 *
 * Modelo (copiado del Excel, sin recalcular):
 *   MONTO ($)                → cantidad operada (pesos)
 *   % COM. GANANCIA          → commission_percent
 *   COMISIÓN GANANCIA ($)    → utilidad de EA  (columna I) ← esto es la ganancia
 *   % / COMISIÓN PROVEEDOR   → se registra aparte, NO se resta de la ganancia
 * No hay compra/venta de billetes: spread = 0.
 *
 * Uso:
 *   npx tsx scripts/import-efectivo.mts "<archivo.xlsx>"                (prueba)
 *   npx tsx scripts/import-efectivo.mts "<archivo.xlsx>" --apply        (borra lo importado y recarga)
 *   npx tsx scripts/import-efectivo.mts "<archivo.xlsx>" --incremental  (solo agrega lo nuevo)
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { read, utils } from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { normalizeKey, parseAmount, parseDate } from '../src/lib/import/transfer-import';

const filePath = process.argv[2];
const INCREMENTAL = process.argv.includes('--incremental');
const APPLY = process.argv.includes('--apply') || INCREMENTAL;
if (!filePath) {
  console.error('Uso: npx tsx scripts/import-efectivo.mts "<archivo.xlsx>" [--apply | --incremental]');
  process.exit(1);
}

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  db: { schema: 'divisas' }, auth: { persistSession: false },
});

// ---------- leer el Excel ----------
interface Op {
  date: string;
  client: string | null;
  monto: number;
  pctGan: number;
  comGan: number;      // COMISIÓN GANANCIA ($) — utilidad de EA, copiada del Excel
  pctProv: number;
  comProv: number;
  obs: string | null;
  row: number;
}

const wb = read(readFileSync(filePath), { cellDates: true });
const aoa = utils.sheet_to_json<unknown[]>(wb.Sheets['Registro de Operaciones'], { header: 1, raw: true, defval: '', blankrows: false });
// encabezados en la fila 1 (fila 0 es el título)
const H = (aoa[1] ?? []).map((c) => normalizeKey(c));
const ci = (n: string) => H.findIndex((h) => h.startsWith(n));
const cFecha = ci('FECHA');
const cCliente = ci('CLIENTE');
const cMonto = ci('MONTO');
const cPctProv = ci('% COM. PROVEEDOR');
const cComProv = ci('COMISION PROVEEDOR');
const cPctGan = ci('% COM. GANANCIA');
const cComGan = ci('COMISION GANANCIA');
const cObs = ci('OBSERVACIONES');

const ops: Op[] = [];
let lastDate = '';
let sinFecha = 0;
for (let i = 2; i < aoa.length; i++) {
  const r = aoa[i] ?? [];
  const monto = parseAmount(r[cMonto]);
  const d = parseDate(r[cFecha]);
  if (d) lastDate = d;
  if (!monto || monto <= 0) continue;
  if (!lastDate) { sinFecha++; continue; } // sin fecha ni arrastre → no ubicable
  if (!d) sinFecha++;

  const client = String(r[cCliente] ?? '').replace(/\s+/g, ' ').trim() || null;
  ops.push({
    date: lastDate,
    client,
    monto,
    pctGan: parseAmount(r[cPctGan]) ?? 0,
    comGan: parseAmount(r[cComGan]) ?? 0,
    pctProv: parseAmount(r[cPctProv]) ?? 0,
    comProv: parseAmount(r[cComProv]) ?? 0,
    obs: String(r[cObs] ?? '').trim() || null,
    row: i + 1,
  });
}

const keyOf = (o: Op) =>
  `h:efe|${normalizeKey(o.client ?? '')}|${Math.round(o.monto * 100)}|${o.date}|${Math.round(o.comGan * 100)}`;

// ---------- clientes existentes ----------
const { data: existingClients } = await db.from('clients').select('id, name');
const clientId = new Map((existingClients ?? []).map((c) => [normalizeKey(c.name), c.id as string]));

// ---------- incremental: quitar lo ya registrado ----------
let yaExisten = 0;
let lista = ops;
if (INCREMENTAL) {
  const have = new Set<string>();
  const { data } = await db.from('operations').select('import_key').eq('module', 'efectivo').not('import_key', 'is', null);
  for (const r of data ?? []) have.add(r.import_key as string);
  lista = ops.filter((o) => !have.has(keyOf(o)));
  yaExisten = ops.length - lista.length;
}

const utilTotal = lista.reduce((s, o) => s + o.comGan, 0);
const montoTotal = lista.reduce((s, o) => s + o.monto, 0);
const clientesNuevos = [...new Set(lista.filter((o) => o.client && !clientId.has(normalizeKey(o.client))).map((o) => o.client!))];

console.log(`Operaciones de efectivo en el Excel:   ${ops.length}`);
if (INCREMENTAL) console.log(`  ya registradas (se omiten):          ${yaExisten}\n  NUEVAS:                              ${lista.length}`);
console.log(`  filas sin fecha (usan la de arriba):  ${sinFecha}`);
console.log(`  clientes nuevos a crear:              ${clientesNuevos.length}`);
console.log(`  monto operado (MXN):                  ${montoTotal.toLocaleString('es-MX', { maximumFractionDigits: 2 })}`);
console.log(`  utilidad total (COM. GANANCIA):       ${utilTotal.toLocaleString('es-MX', { maximumFractionDigits: 2 })}`);
console.log('\nmuestra:');
for (const o of lista.slice(0, 8)) {
  console.log(`  ${o.date} | ${(o.client ?? '(sin cliente)').padEnd(20)} | monto ${o.monto.toLocaleString('es-MX')} | ${o.pctGan}% | util ${o.comGan.toLocaleString('es-MX')}`);
}

if (!APPLY) {
  console.log('\n(prueba — --apply borra lo importado y recarga · --incremental solo agrega lo nuevo)');
  process.exit(0);
}
if (INCREMENTAL && !lista.length) {
  console.log('\nNada nuevo que registrar.');
  process.exit(0);
}

// ---------- APPLY ----------
console.log(`\n--- ${INCREMENTAL ? 'INCREMENTAL' : 'APPLY (reemplazo total)'} ---`);
const { data: prof } = await db.from('profiles').select('id').eq('role', 'super_admin').limit(1).single();
const createdBy = prof!.id as string;

if (!INCREMENTAL) {
  const { data: del } = await db.from('operations').select('id').eq('module', 'efectivo').not('import_source', 'is', null);
  console.log(`Borrando ${del?.length ?? 0} operaciones de efectivo importadas anteriores…`);
  for (let i = 0; i < (del ?? []).length; i += 100) {
    const ids = (del ?? []).slice(i, i + 100).map((o) => o.id);
    const { error } = await db.from('operations').delete().in('id', ids);
    if (error) throw error;
  }
}

const { data: batch } = await db
  .from('import_batches')
  .insert({ source: 'excel', file_name: filePath.split(/[\\/]/).pop(), triggered_by: createdBy })
  .select('id').single();
const batchId = batch!.id as string;

for (const name of clientesNuevos) {
  const { data } = await db.from('clients').insert({ name, notes: 'Alta automática por importación de efectivo.' }).select('id, name').single();
  if (data) clientId.set(normalizeKey(data.name), data.id as string);
}

const r2 = (n: number) => Math.round(n * 100) / 100;
let ok = 0, fail = 0;
for (const o of lista) {
  const util = r2(o.comGan);
  const header = {
    client_id: o.client ? clientId.get(normalizeKey(o.client)) ?? null : null,
    created_by: createdBy,
    status: 'completada',
    observations: o.obs,
    operation_date: o.date,
    import_source: 'excel',
    import_key: keyOf(o),
    import_batch_id: batchId,
    gross_revenue: util,
    total_costs: 0,
    gross_profit: util,
    net_profit: util,
    margin_percent: o.monto ? r2((util / o.monto) * 100) : 0,
  };
  const details = {
    currency_code: 'MXN',
    denomination: null,
    quantity: o.monto,
    buy_price: 1,
    sell_price: 1,
    exchange_rate_reference: null,
    commission_fixed: 0,
    commission_percent: o.pctGan,
    commission_amount: util,
    spread_per_unit: 0,
    spread_total: 0,
    provider_id: null,
    provider_commission_percent: o.pctProv,
    provider_commission_amount: r2(o.comProv),
  };
  const { error } = await db.rpc('create_cash_operation', { p_header: header, p_details: details });
  if (error) { fail++; if (fail <= 8) console.error(`  fila ${o.row} (${o.client}): ${error.message}`); }
  else ok++;
}
console.log(`\ncreadas: ${ok} | con error: ${fail}`);
