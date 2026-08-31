/**
 * Aplica SOLO la migración 030 vía el pooler de Supabase (session mode),
 * usando el password que ya está en DATABASE_URL de .env. Es un one-off:
 * scripts/migrate.mjs sigue siendo la vía normal (necesita SUPABASE_ACCESS_TOKEN).
 *
 * Uso:  node scripts/apply-migration-030.mjs
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = '030_transfer_import.sql';
const HOST = 'aws-0-us-west-2.pooler.supabase.com';
const PROJECT_REF = 'cwyrsqhoqieaamfgbuyb';

const pw = (process.env.DATABASE_URL || '').match(/postgres:([^@]+)@/);
if (!pw) {
  console.error('No encontré el password en DATABASE_URL (.env).');
  process.exit(1);
}

const sql = readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', FILE), 'utf8');

const client = new pg.Client({
  host: HOST,
  port: 5432,
  database: 'postgres',
  user: `postgres.${PROJECT_REF}`,
  password: decodeURIComponent(pw[1]),
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

const main = async () => {
  await client.connect();
  try {
    const done = await client.query('select 1 from divisas._migrations where filename = $1', [FILE]);
    if (done.rowCount) {
      console.log(`= ${FILE} ya estaba aplicada. Nada que hacer.`);
      return;
    }

    await client.query('begin');
    await client.query(sql);
    await client.query('insert into divisas._migrations (filename) values ($1)', [FILE]);
    await client.query('commit');
    console.log(`OK  ${FILE} aplicada.`);

    const cols = await client.query(
      `select column_name from information_schema.columns
       where table_schema = 'divisas' and table_name = 'international_transfers'
         and column_name in ('uetr','tc_reference','amount_mxn','promotor','flag_pago')
       order by column_name`,
    );
    console.log('columnas nuevas en international_transfers:', cols.rows.map((r) => r.column_name).join(', '));
    const t = await client.query("select to_regclass('divisas.import_batches')::text as t");
    console.log('tabla import_batches:', t.rows[0].t);
    const fn = await client.query(
      `select pg_get_function_arguments(oid) as args from pg_proc
       where proname = 'create_transfer_operation' and pronamespace = 'divisas'::regnamespace`,
    );
    console.log('create_transfer_operation args:', fn.rows[0]?.args);
  } catch (err) {
    await client.query('rollback').catch(() => {});
    console.error('FALLÓ (rollback aplicado):', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
