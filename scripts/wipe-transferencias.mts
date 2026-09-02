#!/usr/bin/env -S npx tsx
/**
 * BORRA TODAS las transferencias internacionales (operations module =
 * 'transferencia'), importadas y capturadas a mano, de cualquier fecha.
 * Pensado para "empezar de cero" y recargar después desde un Excel bueno.
 *
 * Qué se borra (por cascade de la FK operation_id):
 *   - divisas.operations (la cabecera)          — DELETE directo
 *   - divisas.international_transfers            — cascade
 *   - divisas.operation_status_history          — cascade
 *   - divisas.attachments                       — cascade (¡los adjuntos!)
 * Qué NO tiene cascade y hay que resolver antes:
 *   - divisas.reconciliations.operation_id      — se pone en NULL (la fila de
 *     conciliación se conserva, solo se desata de la operación borrada)
 *
 * ANTES de borrar escribe un respaldo completo:
 *   wipe-transferencias-backup-<fecha>.json  (filas enteras de operations +
 *   international_transfers + los ids de conciliación que se desataron)
 *
 * Uso (Windows: node --use-system-ca por el TLS contra Supabase):
 *   node --use-system-ca --import tsx scripts/wipe-transferencias.mts
 *       → prueba: cuenta qué se borraría, no toca nada.
 *   node --use-system-ca --import tsx scripts/wipe-transferencias.mts -- --apply
 *       → escribe el respaldo y borra.
 *   node --use-system-ca --import tsx scripts/wipe-transferencias.mts -- --restore <backup.json>
 *       → recrea las operaciones desde el respaldo (los FOLIOS se regeneran,
 *         no vuelven a ser los mismos; los adjuntos NO se recuperan).
 *
 * Env (.env):  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 */
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const restoreIdx = process.argv.indexOf('--restore');
const RESTORE_FILE = restoreIdx >= 0 ? process.argv[restoreIdx + 1] : null;

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  db: { schema: 'divisas' },
  auth: { persistSession: false },
});

const chunk = <T,>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

// ---------- RESTORE ----------
if (RESTORE_FILE) {
  interface BackupOp {
    operation: Record<string, unknown>;
    transfer: Record<string, unknown> | null;
  }
  const backup = JSON.parse(readFileSync(RESTORE_FILE, 'utf8')) as { operations: BackupOp[] };
  const { data: prof } = await db.from('profiles').select('id').eq('role', 'super_admin').limit(1).single();
  const createdBy = prof!.id as string;
  console.log(`Recreando ${backup.operations.length} operaciones desde ${RESTORE_FILE} (folios nuevos)…`);
  let rok = 0;
  let rfail = 0;
  for (const b of backup.operations) {
    const o = b.operation;
    const t = b.transfer ?? {};
    const header = {
      client_id: o.client_id ?? null,
      created_by: o.created_by ?? createdBy,
      provider_id: o.provider_id ?? null,
      status: o.status ?? 'completada',
      reference: o.reference ?? null,
      observations: o.observations ?? null,
      operation_date: o.operation_date ?? null,
      import_source: o.import_source ?? null,
      import_key: o.import_key ?? null,
      gross_revenue: o.gross_revenue ?? 0,
      total_costs: o.total_costs ?? 0,
      gross_profit: o.gross_profit ?? 0,
      net_profit: o.net_profit ?? 0,
      margin_percent: o.margin_percent ?? 0,
    };
    const { error } = await db.rpc('create_transfer_operation', { p_header: header, p_details: t });
    if (error) {
      rfail++;
      if (rfail <= 10) console.error(`  ${o.folio}: ${error.message}`);
    } else {
      rok++;
    }
  }
  console.log(`\nrecreadas: ${rok} | con error: ${rfail}`);
  process.exit(rfail ? 1 : 0);
}

// ---------- 1) inventario ----------
const { data: ops, error } = await db
  .from('operations')
  .select('*, international_transfers(*)')
  .eq('module', 'transferencia');
if (error) throw error;
const rows = (ops ?? []) as unknown as Array<Record<string, unknown> & { id: string; folio: string; operation_date: string | null; import_source: string | null; international_transfers: Record<string, unknown> | null }>;

const ids = rows.map((r) => r.id);
const importadas = rows.filter((r) => r.import_source != null).length;
const manuales = rows.length - importadas;
const fechas = rows.map((r) => r.operation_date).filter(Boolean).sort() as string[];

// conciliaciones atadas
let reconIds: string[] = [];
if (ids.length) {
  const { data: recs } = await db.from('reconciliations').select('id, operation_id').not('operation_id', 'is', null);
  const idset = new Set(ids);
  reconIds = (recs ?? []).filter((r) => idset.has(r.operation_id as string)).map((r) => r.id as string);
}
// adjuntos que se irían por cascade
let attachCount = 0;
if (ids.length) {
  const { count } = await db.from('attachments').select('id', { count: 'exact', head: true }).in('operation_id', ids.slice(0, 1000));
  attachCount = count ?? 0;
}

console.log('TRANSFERENCIAS A BORRAR');
console.log(`  total:                    ${rows.length}`);
console.log(`    importadas (Excel):     ${importadas}`);
console.log(`    capturadas a mano:      ${manuales}`);
console.log(`  rango de fechas:          ${fechas[0] ?? '—'}  →  ${fechas[fechas.length - 1] ?? '—'}`);
console.log(`  conciliaciones a desatar: ${reconIds.length}  (se conservan, se les pone operation_id = NULL)`);
console.log(`  adjuntos que se borran:   ${attachCount}  (por cascade, NO recuperables)`);

if (!APPLY) {
  console.log('\n(prueba — corre con  -- --apply  para escribir el respaldo y borrar)');
  process.exit(0);
}
if (!rows.length) {
  console.log('\nNo hay nada que borrar.');
  process.exit(0);
}

// ---------- 2) respaldo ----------
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = `wipe-transferencias-backup-${stamp}.json`;
writeFileSync(
  backupPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      count: rows.length,
      detachedReconciliations: reconIds,
      operations: rows.map((r) => {
        const { international_transfers, ...operation } = r;
        return { operation, transfer: international_transfers };
      }),
    },
    null,
    2,
  ),
);
console.log(`\nRespaldo de ${rows.length} operaciones → ${backupPath}`);

// ---------- 3) desatar conciliaciones ----------
if (reconIds.length) {
  for (const c of chunk(reconIds, 100)) {
    const { error: e } = await db.from('reconciliations').update({ operation_id: null }).in('id', c);
    if (e) throw e;
  }
  console.log(`Conciliaciones desatadas: ${reconIds.length}`);
}

// ---------- 4) borrar ----------
console.log(`--- APPLY: borrando ${ids.length} operaciones ---`);
let deleted = 0;
let fail = 0;
for (const c of chunk(ids, 100)) {
  const { error: e } = await db.from('operations').delete().in('id', c);
  if (e) {
    fail += c.length;
    console.error(`  lote falló: ${e.message}`);
  } else {
    deleted += c.length;
  }
}
console.log(`\nborradas: ${deleted} | con error: ${fail}`);
console.log(`respaldo: ${backupPath}`);
