#!/usr/bin/env node
/**
 * Corre un archivo .sql suelto contra DATABASE_URL — usado para el seed de
 * desarrollo (supabase/seed/demo_data.sql), que a propósito NO forma parte
 * del runner de migraciones.
 *
 * Uso: node scripts/run-sql.mjs supabase/seed/demo_data.sql
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const file = process.argv[2];
if (!file) {
  console.error('Uso: node scripts/run-sql.mjs <archivo.sql>');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Falta DATABASE_URL en .env');
  process.exit(1);
}

const sql = readFileSync(file, 'utf8');
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  const res = await client.query(sql);
  const notices = res?.length ? res.map((r) => r.command) : [res?.command];
  console.log('OK:', file, notices.filter(Boolean).join(', '));
  await client.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
