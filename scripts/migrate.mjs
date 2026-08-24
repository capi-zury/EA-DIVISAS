#!/usr/bin/env node
/**
 * Aplica, en orden, todos los archivos .sql de supabase/migrations/ contra
 * el proyecto de Supabase, vía la Management API (no necesita connection
 * string de Postgres, solo un Personal Access Token — dashboard → Account →
 * Access Tokens). Lleva un registro de qué migraciones ya corrieron en
 * divisas._migrations para no reaplicarlas. supabase/seed/ NUNCA se toca
 * desde aquí a propósito.
 *
 * Uso: node scripts/migrate.mjs
 */
import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');

const projectRef = process.env.SUPABASE_PROJECT_REF;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
if (!projectRef || !accessToken) {
  console.error('Faltan SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN en .env');
  process.exit(1);
}

const apiUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

async function runSql(query) {
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const body = await res.json();
  if (!res.ok) {
    const message = body?.message || body?.error || JSON.stringify(body);
    throw new Error(message);
  }
  return body;
}

async function main() {
  await runSql('create schema if not exists divisas;');
  await runSql(`
    create table if not exists divisas._migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const appliedRows = await runSql('select filename from divisas._migrations;');
  const applied = new Set(appliedRows.map((r) => r.filename));

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let ranAny = false;
  let failed = false;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  = ${file} (ya aplicada)`);
      continue;
    }
    ranAny = true;
    const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`  → aplicando ${file} ...`);
    try {
      await runSql(`begin; ${sql}\n insert into divisas._migrations (filename) values ('${file}'); commit;`);
      console.log(`  ✓ ${file}`);
    } catch (err) {
      console.error(`  ✗ ${file} falló:\n`, err.message);
      failed = true;
      break;
    }
  }

  if (!ranAny && !failed) console.log('Nada nuevo que aplicar — base al día.');
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
