/**
 * Sigue el último run del workflow de Pages hasta que termine y luego
 * comprueba que el sitio responde. Uso: node scripts/check-pages-deploy.mjs
 */
import { execFileSync } from 'node:child_process';

const OWNER = 'capi-zury';
const REPO = 'EA-DIVISAS';
const SITE = `https://${OWNER.toLowerCase()}.github.io/${REPO}/`;

const token = execFileSync('git', ['credential', 'fill'], {
  input: 'protocol=https\nhost=github.com\n\n',
  encoding: 'utf8',
}).match(/^password=(.+)$/m)[1].trim();

const H = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function latestRun() {
  const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/deploy-pages.yml/runs?per_page=1`, { headers: H });
  const j = await r.json();
  return j.workflow_runs?.[0];
}

for (let i = 0; i < 40; i++) {
  const run = await latestRun();
  if (!run) {
    console.log('aún no aparece el run…');
  } else {
    console.log(`run #${run.run_number}: ${run.status}${run.conclusion ? ' / ' + run.conclusion : ''}`);
    if (run.status === 'completed') {
      if (run.conclusion !== 'success') {
        console.log(`\n❌ El build no pasó. Revisa: ${run.html_url}`);
        process.exit(1);
      }
      break;
    }
  }
  await sleep(10000);
}

await sleep(5000);
const res = await fetch(SITE, { redirect: 'follow' });
const html = await res.text();
const ok = res.status === 200 && /<div id="root">/.test(html);
console.log(`\n${SITE} → HTTP ${res.status} ${ok ? '✅ la pantalla responde' : '⚠️ respuesta inesperada'}`);
process.exit(ok ? 0 : 1);
