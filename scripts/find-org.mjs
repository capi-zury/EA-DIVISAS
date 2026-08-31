import { execFileSync } from 'node:child_process';
const tok = execFileSync('git', ['credential', 'fill'], {
  input: 'protocol=https\nhost=github.com\n\n',
  encoding: 'utf8',
}).match(/^password=(.+)$/m)[1].trim();
const H = { Authorization: `Bearer ${tok}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };

const orgs = await (await fetch('https://api.github.com/user/orgs', { headers: H })).json();
console.log('Organizaciones de las que eres miembro:');
for (const o of orgs) console.log(`  slug="${o.login}"  ->  https://${o.login.toLowerCase()}.github.io/`);

const me = await (await fetch('https://api.github.com/user', { headers: H })).json();
console.log(`\nUsuario del token: ${me.login}`);
