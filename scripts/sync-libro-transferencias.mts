#!/usr/bin/env -S npx tsx
/**
 * Trae el "Libro de transferencias" (control diario de septiembre 2026 en
 * adelante) desde OneDrive/SharePoint y registra SOLO las transferencias
 * nuevas. Reutiliza src/lib/import/libro-transferencias.ts (parser + mapeo).
 *
 * Es el reemplazo del "ESTADO DE CUENTA CLIENTES" para transferencias: mismo
 * mecanismo de descarga y deduplicación que scripts/sync-estado-cuenta.mts,
 * pero otro formato de origen (una fila por transferencia; el cliente entrega
 * pesos y el beneficiario recibe dólares).
 *
 * Utilidad EA por fila = spread − comisión al comisionista − comisión del
 * banco (ver el reglamento en libro-transferencias.ts).
 *
 * Uso:
 *   npx tsx scripts/sync-libro-transferencias.mts                 (dry-run: solo reporta)
 *   npx tsx scripts/sync-libro-transferencias.mts --apply          (registra las nuevas)
 * En Windows: node --use-system-ca --import tsx scripts/sync-libro-transferencias.mts
 *
 * Env (.env local o secrets del workflow):
 *   LIBRO_TRANSFERENCIAS_URL      link "Cualquiera con el vínculo" del .xlsx
 *   LIBRO_TRANSFERENCIAS_FILE     alternativa: ruta local al .xlsx
 *   SUPABASE_URL / VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { read, utils } from 'xlsx';
import { normalizeKey } from '../src/lib/import/transfer-import';
import {
  libroImportKey,
  libroToTransferPayload,
  looksLikeLibroTransferencias,
  parseLibroTransferencias,
} from '../src/lib/import/libro-transferencias';

const APPLY = process.argv.includes('--apply');
const SUPER_ADMIN_EMAIL = 'zkassin@estructuraagil.com';
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
  const localFile = process.env.LIBRO_TRANSFERENCIAS_FILE;
  if (localFile) {
    console.log('Leyendo libro local:', localFile);
    return readFileSync(localFile);
  }
  const sourceUrl = process.env.LIBRO_TRANSFERENCIAS_URL;
  if (!sourceUrl) throw new Error('Falta LIBRO_TRANSFERENCIAS_URL (o LIBRO_TRANSFERENCIAS_FILE) en el entorno.');
  console.log('Descargando libro de transferencias…');
  const res = await fetch(toSharePointDownloadUrl(sourceUrl), { headers: { 'User-Agent': BROWSER_UA } });
  if (!res.ok) {
    throw new Error(
      `SharePoint respondió ${res.status}. Si es 403, revisa que el link siga siendo "Cualquiera con el vínculo"; ` +
        'si es 503, reintenta en un minuto.',
    );
  }
  if ((res.headers.get('content-type') ?? '').includes('text/html')) {
    throw new Error('SharePoint devolvió una página HTML en vez del .xlsx — el link ya no es anónimo o pide sesión.');
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const buf = await getWorkbookBytes();
  console.log(`✓ ${buf.byteLength.toLocaleString('es-MX')} bytes`);

  const wb = read(buf, { cellDates: true });
  const sheets = wb.SheetNames.map((name) => ({
    name,
    aoa: utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: '', blankrows: false }),
  })).filter((s) => s.aoa.length > 0);

  if (!looksLikeLibroTransferencias(sheets)) {
    throw new Error('El archivo no tiene pinta de "libro de transferencias" (columnas MONTO USD / MONTO RECIBIDO / TIPO DE CAMBIO COMPRA).');
  }

  const pagos = parseLibroTransferencias(sheets);
  console.log(`✓ ${pagos.length} transferencias leídas de ${sheets.length} hoja(s)`);
  if (!pagos.length) {
    console.log('Nada que registrar.');
    return;
  }

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.');
  const db = createClient(url, key, { db: { schema: 'divisas' }, auth: { persistSession: false } });

  const { data: profile, error: profErr } = await db.from('profiles').select('id').eq('email', SUPER_ADMIN_EMAIL).single();
  if (profErr || !profile) throw new Error(`No encontré el perfil de ${SUPER_ADMIN_EMAIL}: ${profErr?.message}`);
  const userId = profile.id as string;

  // ¿cuáles ya existen? (todas las import_key de transferencias — son pocas)
  const existing = new Set<string>();
  {
    const { data, error } = await db
      .from('operations')
      .select('import_key')
      .eq('module', 'transferencia')
      .not('import_key', 'is', null);
    if (error) throw error;
    for (const r of data ?? []) existing.add(r.import_key as string);
  }

  const nuevos = pagos.filter((p) => !existing.has(libroImportKey(p)));
  const yaRegistradas = pagos.length - nuevos.length;

  // clientes: match por nombre normalizado, crea los que falten
  const clientIdByKey = new Map<string, string>();
  {
    const { data, error } = await db.from('clients').select('id, name');
    if (error) throw error;
    for (const c of data ?? []) clientIdByKey.set(normalizeKey(c.name), c.id as string);
  }
  const nombresNuevos = [...new Set(nuevos.map((p) => p.client).filter((n) => n && !clientIdByKey.has(normalizeKey(n))))];

  console.log(
    `\n${APPLY ? 'Import real' : 'Dry-run'} — total ${pagos.length} · nuevas ${nuevos.length} · ya registradas ${yaRegistradas} · clientes nuevos ${nombresNuevos.length}`,
  );
  for (const p of nuevos.slice(0, 12)) {
    console.log(`  ${p.date} · ${p.client} · ${p.usd.toLocaleString('es-MX')} USD · util ${p.totalCasa.toLocaleString('es-MX')}`);
  }

  if (!APPLY) {
    console.log('\n(dry-run — corre con --apply para registrarlas)');
    return;
  }
  if (!nuevos.length) return;

  for (const name of nombresNuevos) {
    const { data } = await db
      .from('clients')
      .insert({ name, notes: 'Alta automática por sincronización del libro de transferencias.' })
      .select('id, name')
      .single();
    if (data) clientIdByKey.set(normalizeKey(data.name), data.id as string);
  }

  const { data: batch, error: batchErr } = await db
    .from('import_batches')
    .insert({ source: 'excel', file_name: 'libro de transferencias', triggered_by: userId })
    .select('id')
    .single();
  if (batchErr) throw batchErr;
  const batchId = batch.id as string;

  let created = 0;
  let errors = 0;
  for (const p of nuevos) {
    const { header, details } = libroToTransferPayload(p, {
      createdBy: userId,
      clientId: clientIdByKey.get(normalizeKey(p.client)) ?? null,
      importBatchId: batchId,
    });
    const { error } = await db.rpc('create_transfer_operation', { p_header: header, p_details: details });
    if (error) {
      errors++;
      if (errors <= 8) console.error(`  ${p.client}/${p.date}: ${error.message}`);
    } else {
      created++;
    }
  }

  await db
    .from('import_batches')
    .update({ total_rows: pagos.length, created_count: created, skipped_count: yaRegistradas, error_count: errors, finished_at: new Date().toISOString() })
    .eq('id', batchId);

  console.log(`\ncreadas: ${created} | ya estaban: ${yaRegistradas} | con error: ${errors}`);
}

main().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
