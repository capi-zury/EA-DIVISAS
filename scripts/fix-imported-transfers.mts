#!/usr/bin/env -S npx tsx
/**
 * Corrige transferencias YA importadas (no vuelve a importar): les pone el
 * estado indicado y deduce el país destino de la dirección del beneficiario.
 * Solo toca operaciones con import_source (las que entraron por "Importar de
 * Excel"), nunca las capturadas a mano.
 *
 * Uso:  npx tsx scripts/fix-imported-transfers.mts [estado]
 *       (estado por defecto: completada)
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { detectCountry } from '../src/lib/import/transfer-import';
import { OPERATION_STATUSES, type OperationStatus } from '../src/lib/domain/operation-status';

const targetStatus = (process.argv[2] ?? 'completada') as OperationStatus;
if (!OPERATION_STATUSES.includes(targetStatus)) {
  console.error(`Estado inválido: ${targetStatus}. Usa uno de: ${OPERATION_STATUSES.join(', ')}`);
  process.exit(1);
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env');
  process.exit(1);
}
const db = createClient(url, key, { db: { schema: 'divisas' }, auth: { autoRefreshToken: false, persistSession: false } });

const { data: ops, error } = await db
  .from('operations')
  .select('id, status, international_transfers(operation_id, country_destination, beneficiary_name, beneficiary_address, bank_address)')
  .eq('module', 'transferencia')
  .not('import_source', 'is', null);
if (error) throw error;

let statusFixed = 0;
let countryFixed = 0;

for (const op of ops ?? []) {
  const t = (op as { international_transfers: any }).international_transfers;

  if (op.status !== targetStatus) {
    const { error: e } = await db.from('operations').update({ status: targetStatus }).eq('id', op.id);
    if (e) console.error(`  estado ${op.id}: ${e.message}`);
    else statusFixed++;
  }

  if (t) {
    const guess = detectCountry(t.beneficiary_address, t.bank_address, t.beneficiary_name);
    if (guess && guess !== t.country_destination) {
      const { error: e } = await db
        .from('international_transfers')
        .update({ country_destination: guess })
        .eq('operation_id', t.operation_id);
      if (e) console.error(`  país ${op.id}: ${e.message}`);
      else countryFixed++;
    }
  }
}

console.log(`Operaciones importadas: ${ops?.length ?? 0}`);
console.log(`  estado → "${targetStatus}": ${statusFixed} actualizadas`);
console.log(`  país destino deducido: ${countryFixed} actualizadas`);
