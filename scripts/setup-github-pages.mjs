/**
 * Deja lista la publicación en GitHub Pages, una sola vez:
 *   - crea/actualiza las variables del repo VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 *     (no son secretas: la clave anon/publishable es pública por diseño)
 *   - activa Pages con Source = "GitHub Actions"
 *   - dispara el workflow de deploy
 *
 * Usa el token de GitHub que ya tienes guardado (el mismo del `git push`).
 * Uso:  node scripts/setup-github-pages.mjs
 */
import { execFileSync } from 'node:child_process';

const OWNER = 'capi-zury';
const REPO = 'EA-DIVISAS';
const VARS = {
  VITE_SUPABASE_URL: 'https://cwyrsqhoqieaamfgbuyb.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'sb_publishable__y7LJ0Hll0DVhumua9fDrA_HZiHlksN',
};

function githubToken() {
  const out = execFileSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8',
  });
  const m = out.match(/^password=(.+)$/m);
  if (!m) throw new Error('No se encontró el token de GitHub en el credential helper. Haz un `git push` primero.');
  return m[1].trim();
}

const TOKEN = githubToken();
const H = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
};

async function api(method, path, body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

async function main() {
  for (const [name, value] of Object.entries(VARS)) {
    let r = await api('POST', `/repos/${OWNER}/${REPO}/actions/variables`, { name, value });
    if (r.status === 409) r = await api('PATCH', `/repos/${OWNER}/${REPO}/actions/variables/${name}`, { value });
    console.log(`variable ${name}: HTTP ${r.status} ${r.status < 300 ? 'OK' : JSON.stringify(r.json)}`);
  }

  let p = await api('POST', `/repos/${OWNER}/${REPO}/pages`, { build_type: 'workflow' });
  if (p.status === 409) p = await api('PUT', `/repos/${OWNER}/${REPO}/pages`, { build_type: 'workflow' });
  console.log(`pages: HTTP ${p.status} ${p.json?.html_url ?? p.json?.message ?? ''}`);

  const d = await api('POST', `/repos/${OWNER}/${REPO}/actions/workflows/deploy-pages.yml/dispatches`, { ref: 'main' });
  console.log(`disparo del workflow: HTTP ${d.status} ${d.status === 204 ? 'OK (build en marcha)' : JSON.stringify(d.json)}`);

  console.log('\nListo. Mira el avance en:');
  console.log(`  https://github.com/${OWNER}/${REPO}/actions`);
  console.log('Cuando termine, el sistema queda en:');
  console.log(`  https://${OWNER.toLowerCase()}.github.io/${REPO}/`);
}

main().catch((err) => {
  console.error('FALLÓ:', err.message);
  process.exit(1);
});
