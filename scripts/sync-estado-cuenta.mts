#!/usr/bin/env -S npx tsx
/**
 * Trae el "ESTADO DE CUENTA CLIENTES" desde OneDrive/SharePoint y registra
 * SOLO los pagos nuevos (misma lógica y misma deduplicación que "Importar de
 * Excel" en la app — reutiliza src/lib/import/estado-cuenta.ts y
 * src/lib/server/import-operations.ts, no hay una segunda copia del parseo).
 *
 * Pensado para correr solo, a diario (ver .github/workflows/sync-estado-cuenta.yml):
 * el archivo se comparte con un link "Cualquiera con el vínculo" (anónimo). Si
 * lo cambian a "Personas de la organización", SharePoint pide una sesión de
 * Microsoft 365 que un cron no tiene y esto empieza a fallar con 403.
 *
 * Ojo con el link: la URL de vista previa que copia SharePoint
 * (https://…-my.sharepoint.com/:x:/g/personal/<usuario>/<TOKEN>?e=…) responde
 * 403 a cualquier cliente que no sea un navegador. getWorkbookBytes() la
 * traduce a .../_layouts/15/download.aspx?share=<TOKEN> y manda un User-Agent
 * de navegador — así sí entrega el .xlsx sin sesión.
 *
 * Uso:
 *   npx tsx scripts/sync-estado-cuenta.mts              (dry-run: solo reporta)
 *   npx tsx scripts/sync-estado-cuenta.mts --apply       (registra los pagos nuevos)
 *
 * Variables de entorno (.env local o secrets del workflow):
 *   ESTADO_CUENTA_URL              link "Cualquiera con el vínculo" del .xlsx
 *                                  (se pega tal cual lo copia SharePoint)
 *   ESTADO_CUENTA_FILE             alternativa: ruta local al .xlsx ya descargado
 *                                  (para probar sin tocar la red)
 *   SUPABASE_URL / VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Nota para correr en local en Windows: si Node falla con
 * UNABLE_TO_GET_ISSUER_CERT_LOCALLY al hablar con Supabase, es la caché de CAs
 * de Node vs. la del sistema — corre con `node --use-system-ca --import tsx
 * scripts/sync-estado-cuenta.mts`. En los runners de GitHub no pasa.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { read, utils } from 'xlsx';
import { looksLikeEstadoCuenta, parseEstadoCuenta } from '../src/lib/import/estado-cuenta';
import { handleEstadoCuenta } from '../src/lib/server/import-operations';
import { supabaseAdmin } from '../src/lib/server/supabase';

const APPLY = process.argv.includes('--apply');

const SUPER_ADMIN_EMAIL = 'zkassin@estructuraagil.com'; // dueño de las operaciones que crea este sync

// SharePoint bloquea el endpoint de vista previa (/:x:/g/…) para clientes que no
// son un navegador. El de descarga directa (_layouts/15/download.aspx?share=…) sí
// responde de forma anónima con un User-Agent normal.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Traduce el link que copia SharePoint a su URL de descarga directa. */
function toSharePointDownloadUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  if (url.pathname.includes('/_layouts/15/download.aspx')) return rawUrl; // ya es de descarga
  // .../:x:/g/personal/<usuario>/<TOKEN>[?...]  ->  token = segmento tras /personal/<usuario>/
  const m = url.pathname.match(/\/personal\/([^/]+)\/([^/?#]+)/);
  if (!m) return rawUrl.includes('?') ? rawUrl : `${rawUrl}?download=1`; // no es un link -my; se intenta tal cual
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
  if (!res.ok) {
    throw new Error(
      `SharePoint respondió ${res.status}. Si es 403, revisa que el link siga siendo "Cualquiera con el vínculo" ` +
        '(no "Personas de la organización") — puede haber caducado o lo hayan cambiado.'
    );
  }
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('text/html')) {
    throw new Error(
      'SharePoint devolvió una página HTML en vez del .xlsx — casi siempre es que el link ya no es anónimo ' +
        'o pide iniciar sesión. Ábrelo en una ventana de incógnito para confirmar.'
    );
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

  if (!looksLikeEstadoCuenta(sheets)) {
    throw new Error('El archivo ya no tiene pinta de "estado de cuenta" (columnas NOMBRE/USD/TC) — revísalo a mano.');
  }

  const pagos = parseEstadoCuenta(sheets);
  console.log(`✓ ${pagos.length} pagos leídos de ${sheets.length} hojas`);

  const admin = supabaseAdmin({
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  const { data: profile, error: profileErr } = await admin.from('profiles').select('id').eq('email', SUPER_ADMIN_EMAIL).single();
  if (profileErr || !profile) throw new Error(`No encontré el perfil de ${SUPER_ADMIN_EMAIL}: ${profileErr?.message}`);

  const result = await handleEstadoCuenta(admin, profile.id as string, pagos, !APPLY);
  if (result.status !== 200) {
    console.error('✗ Falló:', result.body);
    process.exit(1);
  }

  const s = (result.body as { summary: Record<string, number> }).summary;
  console.log(
    `\n${APPLY ? 'Import real' : 'Dry-run'} — total ${s.total} · nuevas ${APPLY ? s.created : s.ready} · ya registradas ${s.skipped} · errores ${s.errors} · clientes nuevos ${s.newClients}`
  );
  if (!APPLY && s.ready > 0) console.log('Corre de nuevo con --apply para registrarlas.');
}

main().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
