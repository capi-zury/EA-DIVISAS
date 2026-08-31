/**
 * Prepara el sitio en la organización EA-DIVISAS:
 *  - crea el repo EA-DIVISAS/EA-DIVISAS.github.io (público) si no existe
 *  - variables del repo VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 *  - activa Pages con Source = GitHub Actions
 * Después, desde la terminal:  git push org main
 */
import { execFileSync } from 'node:child_process';

const ORG = 'EA-DIVISAS';
const REPO = 'EA-DIVISAS.github.io';
const VARS = {
  VITE_SUPABASE_URL: 'https://cwyrsqhoqieaamfgbuyb.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'sb_publishable__y7LJ0Hll0DVhumua9fDrA_HZiHlksN',
};

const tok = execFileSync('git', ['credential', 'fill'], {
  input: 'protocol=https\nhost=github.com\n\n',
  encoding: 'utf8',
}).match(/^password=(.+)$/m)[1].trim();
const H = {
  Authorization: `Bearer ${tok}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
};
const api = async (m, p, b) => {
  const r = await fetch(`https://api.github.com${p}`, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined });
  const t = await r.text();
  let j = null;
  try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  return { status: r.status, j };
};

// 1) repo
let repo = await api('GET', `/repos/${ORG}/${REPO}`);
if (repo.status === 404) {
  repo = await api('POST', `/orgs/${ORG}/repos`, {
    name: REPO,
    private: false,
    has_issues: false,
    has_wiki: false,
    description: 'EA Divisas — sistema de operaciones (pantalla)',
  });
}
console.log(`repo: HTTP ${repo.status} ${repo.j?.full_name ?? repo.j?.message ?? ''}`);
if (repo.status >= 400) process.exit(1);

// 2) variables
for (const [name, value] of Object.entries(VARS)) {
  let r = await api('POST', `/repos/${ORG}/${REPO}/actions/variables`, { name, value });
  if (r.status === 409) r = await api('PATCH', `/repos/${ORG}/${REPO}/actions/variables/${name}`, { value });
  console.log(`variable ${name}: HTTP ${r.status}`);
}

// 3) Pages
let pg = await api('POST', `/repos/${ORG}/${REPO}/pages`, { build_type: 'workflow' });
if (pg.status === 409) pg = await api('PUT', `/repos/${ORG}/${REPO}/pages`, { build_type: 'workflow' });
console.log(`pages: HTTP ${pg.status} ${pg.j?.html_url ?? pg.j?.message ?? ''}`);

console.log('\nAhora:  git remote add org https://github.com/EA-DIVISAS/EA-DIVISAS.github.io.git  &&  git push org main');
