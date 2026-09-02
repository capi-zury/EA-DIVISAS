#!/usr/bin/env -S npx tsx
/**
 * Re-precia EN SITIO las transferencias ya importadas del "ESTADO DE CUENTA
 * CLIENTES" para que queden con el reglamento de utilidad vigente:
 *   utilidad = comisión + spread, y el spread solo cuenta cuando la hoja trae
 *   TC de compra Y de venta con datos completos (si falta el TC de compra se
 *   iguala al de venta → spread 0). La columna DIFERENCIA de la hoja no se usa.
 *
 * A diferencia de scripts/reimport-transferencias.mts, esto NO borra
 * operaciones, NO regenera folios y NO toca datos bancarios ni adjuntos: solo
 * hace UPDATE de los campos de utilidad y spread de las filas cuyo número
 * cambia con el reglamento nuevo. Empareja por `operations.import_key`
 * (misma llave que produce el import: beneficiario+monto+fecha+cliente).
 *
 * Reutiliza src/lib/import/estado-cuenta.ts, así que los números que escribe
 * son idénticos a los que produciría un import nuevo.
 *
 * Uso (Windows: node --use-system-ca por el TLS contra Supabase):
 *   node --use-system-ca --import tsx scripts/reprice-transferencias-importadas.mts
 *       → prueba: solo reporta cuántas cambian y por cuánto.
 *   node --use-system-ca --import tsx scripts/reprice-transferencias-importadas.mts -- --apply
 *       → escribe un respaldo reprice-backup-<fecha>.json y aplica los UPDATE.
 *   node --use-system-ca --import tsx scripts/reprice-transferencias-importadas.mts -- --revert reprice-backup-<fecha>.json
 *       → restaura los valores del respaldo (no necesita el Excel).
 *
 * Env (.env):
 *   ESTADO_CUENTA_URL     link "Cualquiera con el vínculo" del .xlsx en SharePoint
 *   ESTADO_CUENTA_FILE    alternativa: ruta local al .xlsx (para probar sin red)
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 */
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { read, utils } from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import {
  ecImportKey,
  ecToTransferPayload,
  looksLikeEstadoCuenta,
  parseEstadoCuenta,
  type EcPago,
} from '../src/lib/import/estado-cuenta';

const APPLY = process.argv.includes('--apply');
const revertIdx = process.argv.indexOf('--revert');
const REVERT_FILE = revertIdx >= 0 ? process.argv[revertIdx + 1] : null;
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Traduce el link de vista previa de SharePoint a su URL de descarga directa. */
function toSharePointDownloadUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  if (url.pathname.includes('/_layouts/15/download.aspx')) return rawUrl;
  const m = url.pathname.match(/\/personal\/([^/]+)\/([^/?#]+)/);
  if (!m) return rawUrl.includes('?') ? rawUrl : `${rawUrl}?download=1`;
  const [, user, shareToken] = m;
  return `${url.origin}/personal/${user}/_layouts/15/download.aspx?share=${shareToken}`;
}

async function getWorkbookBytes(): Promise<Buffer> {
  const localFile = process.env.ESTADO_CUENTA_FILE;
  if (localFile) {
    console.log('Leyendo estado de cuenta local:', localFile);
    return readFileSync(localFile);
  }
  const sourceUrl = process.env.ESTADO_CUENTA_URL;
  if (!sourceUrl) throw new Error('Falta ESTADO_CUENTA_URL (o ESTADO_CUENTA_FILE) en el entorno.');
  console.log('Descargando estado de cuenta…');
  const res = await fetch(toSharePointDownloadUrl(sourceUrl), { headers: { 'User-Agent': BROWSER_UA } });
  if (!res.ok) throw new Error(`SharePoint respondió ${res.status} (si es 403/503, reintenta o revisa el link).`);
  if ((res.headers.get('content-type') ?? '').includes('text/html')) {
    throw new Error('SharePoint devolvió HTML en vez del .xlsx — el link ya no es anónimo.');
  }
  return Buffer.from(await res.arrayBuffer());
}

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  db: { schema: 'divisas' },
  auth: { persistSession: false },
});

// ---------- REVERT: restaurar desde un respaldo reprice-backup-*.json ----------
if (REVERT_FILE) {
  interface BackupRow {
    id: string;
    folio: string;
    operations: Record<string, number | null>;
    international_transfers: Record<string, number | null> | null;
  }
  const backup = JSON.parse(readFileSync(REVERT_FILE, 'utf8')) as BackupRow[];
  console.log(`Revirtiendo ${backup.length} filas desde ${REVERT_FILE}…`);
  let rok = 0;
  let rfail = 0;
  for (const b of backup) {
    const e1 = await db.from('operations').update(b.operations).eq('id', b.id);
    const e2 = b.international_transfers
      ? await db.from('international_transfers').update(b.international_transfers).eq('operation_id', b.id)
      : { error: null };
    if (e1.error || e2.error) {
      rfail++;
      if (rfail <= 8) console.error(`  ${b.folio}: ${e1.error?.message ?? e2.error?.message}`);
    } else {
      rok++;
    }
  }
  console.log(`\nrevertidas: ${rok} | con error: ${rfail}`);
  process.exit(rfail ? 1 : 0);
}

// ---------- 1) leer y parsear el estado de cuenta (reglamento nuevo) ----------
const buf = await getWorkbookBytes();
console.log(`✓ ${buf.byteLength.toLocaleString('es-MX')} bytes`);

const wb = read(buf, { cellDates: true });
const sheets = wb.SheetNames.map((name) => ({
  name,
  aoa: utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: '', blankrows: false }),
})).filter((s) => s.aoa.length > 0);
if (!looksLikeEstadoCuenta(sheets)) throw new Error('El archivo no tiene pinta de estado de cuenta (NOMBRE/USD/TC).');

const pagos = parseEstadoCuenta(sheets);
const byKey = new Map<string, EcPago>();
for (const p of pagos) byKey.set(ecImportKey(p), p);
console.log(`✓ ${pagos.length} pagos leídos · ${byKey.size} llaves únicas`);

// ---------- 2) traer las transferencias importadas y comparar ----------
interface ItRow {
  spread_revenue: number | null;
  buy_rate: number | null;
  sell_rate: number | null;
  exchange_rate_applied: number | null;
  commission_amount: number | null;
  commission_fixed: number | null;
  commission_percent: number | null;
}
interface OpRow {
  id: string;
  folio: string;
  import_key: string;
  gross_revenue: number | null;
  gross_profit: number | null;
  net_profit: number | null;
  margin_percent: number | null;
  international_transfers: ItRow | null;
}

const { data, error } = await db
  .from('operations')
  .select(
    'id, folio, import_key, gross_revenue, gross_profit, net_profit, margin_percent, ' +
      'international_transfers(operation_id, spread_revenue, buy_rate, sell_rate, exchange_rate_applied, ' +
      'commission_amount, commission_fixed, commission_percent)',
  )
  .eq('module', 'transferencia')
  .not('import_source', 'is', null);
if (error) throw error;
const rows = (data ?? []) as unknown as OpRow[];

const near = (a: unknown, b: number) => Math.abs(Number(a ?? 0) - b) < 0.005;

interface Change {
  id: string;
  folio: string;
  oldProfit: number;
  newProfit: number;
  /** Snapshot de los valores actuales, para el respaldo previo al UPDATE. */
  old: { operations: Record<string, number | null>; international_transfers: ItRow | null };
  header: ReturnType<typeof ecToTransferPayload>['header'];
  details: ReturnType<typeof ecToTransferPayload>['details'];
}
const changes: Change[] = [];
let iguales = 0;
let sinMatch = 0;

for (const row of rows) {
  const p = byKey.get(row.import_key);
  if (!p) {
    sinMatch++;
    continue;
  }
  const { header, details } = ecToTransferPayload(p, { createdBy: '', clientId: null, importBatchId: '' });
  const t = row.international_transfers;
  const same =
    near(row.net_profit, header.net_profit) &&
    near(row.gross_profit, header.gross_profit) &&
    near(t?.spread_revenue, details.spread_revenue) &&
    near(t?.buy_rate, details.buy_rate);
  if (same) {
    iguales++;
    continue;
  }
  changes.push({
    id: row.id,
    folio: row.folio,
    oldProfit: Number(row.net_profit ?? 0),
    newProfit: header.net_profit,
    old: {
      operations: {
        gross_revenue: row.gross_revenue,
        gross_profit: row.gross_profit,
        net_profit: row.net_profit,
        margin_percent: row.margin_percent,
      },
      international_transfers: t
        ? {
            spread_revenue: t.spread_revenue,
            buy_rate: t.buy_rate,
            sell_rate: t.sell_rate,
            exchange_rate_applied: t.exchange_rate_applied,
            commission_amount: t.commission_amount,
            commission_fixed: t.commission_fixed,
            commission_percent: t.commission_percent,
          }
        : null,
    },
    header,
    details,
  });
}

const deltaTotal = changes.reduce((s, c) => s + (c.newProfit - c.oldProfit), 0);
console.log(`\nTransferencias importadas en la base:  ${rows.length}`);
console.log(`  ya correctas (sin cambio):           ${iguales}`);
console.log(`  sin match en el archivo actual:      ${sinMatch}  (se dejan como están)`);
console.log(`  a re-preciar:                        ${changes.length}`);
console.log(
  `  cambio neto de utilidad:            ${deltaTotal.toLocaleString('es-MX', { maximumFractionDigits: 2 })} MXN`,
);
console.log('\nmuestra (folio · utilidad antes → después), mayores cambios primero:');
for (const c of [...changes]
  .sort((a, b) => Math.abs(b.newProfit - b.oldProfit) - Math.abs(a.newProfit - a.oldProfit))
  .slice(0, 15)) {
  console.log(`  ${c.folio} · ${c.oldProfit.toLocaleString('es-MX')} → ${c.newProfit.toLocaleString('es-MX')}`);
}

if (!APPLY) {
  console.log('\n(prueba — corre con  -- --apply  para escribir los UPDATE)');
  process.exit(0);
}

// ---------- 3) APPLY: UPDATE en sitio ----------
// Respaldo de los valores actuales ANTES de escribir, para poder revertir.
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = `reprice-backup-${stamp}.json`;
writeFileSync(
  backupPath,
  JSON.stringify(
    changes.map((c) => ({ id: c.id, folio: c.folio, ...c.old })),
    null,
    2,
  ),
);
console.log(`\nRespaldo de ${changes.length} filas → ${backupPath}`);

console.log(`--- APPLY: ${changes.length} operaciones ---`);
let ok = 0;
let fail = 0;
for (const c of changes) {
  const e1 = await db
    .from('operations')
    .update({
      gross_revenue: c.header.gross_revenue,
      gross_profit: c.header.gross_profit,
      net_profit: c.header.net_profit,
      margin_percent: c.header.margin_percent,
    })
    .eq('id', c.id);
  const e2 = await db
    .from('international_transfers')
    .update({
      spread_revenue: c.details.spread_revenue,
      buy_rate: c.details.buy_rate,
      sell_rate: c.details.sell_rate,
      exchange_rate_applied: c.details.exchange_rate_applied,
      commission_amount: c.details.commission_amount,
      commission_fixed: c.details.commission_fixed,
      commission_percent: c.details.commission_percent,
    })
    .eq('operation_id', c.id);
  if (e1.error || e2.error) {
    fail++;
    if (fail <= 8) console.error(`  ${c.folio}: ${e1.error?.message ?? e2.error?.message}`);
  } else {
    ok++;
  }
}
console.log(`\nactualizadas: ${ok} | con error: ${fail}`);
