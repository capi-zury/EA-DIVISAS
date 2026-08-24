#!/usr/bin/env node
/**
 * Aplica, en orden, todos los archivos .sql de supabase/migrations/ contra
 * la base indicada en DATABASE_URL (.env, nunca en git). Lleva un registro
 * de qué migraciones ya corrieron en divisas._migrations para no
 * reaplicarlas. supabase/seed/ NUNCA se toca desde aquí a propósito.
 *
 * Uso: node scripts/migrate.mjs
 */
import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Falta DATABASE_URL en .env (connection string de Postgres de Supabase, Settings → Database → URI).');
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();

  await client.query('create schema if not exists divisas;');
  await client.query(`
    create table if not exists divisas._migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const { rows: appliedRows } = await client.query('select filename from divisas._migrations;');
  const applied = new Set(appliedRows.map((r) => r.filename));

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let ranAny = false;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  = ${file} (ya aplicada)`);
      continue;
    }
    ranAny = true;
    const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`  → aplicando ${file} ...`);
    try {
      await client.query('begin;');
      await client.query(sql);
      await client.query('insert into divisas._migrations (filename) values ($1);', [file]);
      await client.query('commit;');
      console.log(`  ✓ ${file}`);
    } catch (err) {
      await client.query('rollback;');
      console.error(`  ✗ ${file} falló:\n`, err.message);
      process.exitCode = 1;
      break;
    }
  }

  if (!ranAny) console.log('Nada nuevo que aplicar — base al día.');
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
