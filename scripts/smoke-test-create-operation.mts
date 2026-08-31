#!/usr/bin/env -S npx tsx
/**
 * Prueba de humo end-to-end: inicia sesión como el usuario real, llama al
 * handler de create-operation directamente (sin desplegar) y confirma que
 * la operación quedó insertada en la base con los cálculos correctos.
 * Usa is_demo: true — nunca mezclar con datos reales.
 *
 * Uso: npx tsx scripts/smoke-test-create-operation.mts <password>
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { handleCreateOperation } from '../src/lib/server/create-operation';
import type { ServerEnv } from '../src/lib/server/types';

const url = process.env.VITE_SUPABASE_URL!;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY!;
const email = 'i55969072@gmail.com';
const password = process.argv[2];

if (!password) {
  console.error('Uso: npx tsx scripts/smoke-test-create-operation.mts <password-del-super_admin>');
  process.exit(1);
}

async function main() {
  const client = createClient(url, anonKey);
  const { data: authData, error: authError } = await client.auth.signInWithPassword({ email, password });
  if (authError || !authData.session) throw new Error('Login falló: ' + authError?.message);
  console.log('✓ Login OK como', email);

  const body = {
    module: 'cripto',
    header: { reference: 'SMOKE-TEST', observations: 'DEMO — prueba de humo automática', is_demo: true, status: 'completada' },
    details: {
      cryptoAssetCode: 'USDT',
      cryptoNetworkId: await getUsdtTronNetworkId(client),
      quantity: 10000,
      marketPrice: 17.0,
      buyPrice: 16.95,
      sellPrice: 17.05,
      providerFeeBuy: 5,
      providerFeeSell: 4,
      networkFee: 2,
      customerFeeFixed: 0,
      customerFeePercent: 0,
    },
  };

  const res = await handleCreateOperation({
    method: 'POST',
    rawBody: JSON.stringify(body),
    authHeader: `Bearer ${authData.session.access_token}`,
    env: process.env as ServerEnv,
  });

  console.log('Status:', res.status);
  console.log(JSON.stringify(res.body, null, 2));

  if (res.status !== 201) {
    throw new Error('La función no devolvió 201.');
  }

  const opId = (res.body as { operation: { id: string } }).operation.id;
  const { data: fetched, error: fetchError } = await client
    .schema('divisas')
    .from('operations')
    .select('folio, module, status, net_profit, is_demo, crypto_transactions(*)')
    .eq('id', opId)
    .single();
  if (fetchError) throw fetchError;
  console.log('\n✓ Operación confirmada en la base:', JSON.stringify(fetched, null, 2));
}

async function getUsdtTronNetworkId(client: ReturnType<typeof createClient>) {
  const { data, error } = await client
    .schema('divisas')
    .from('crypto_networks')
    .select('id')
    .eq('crypto_asset_code', 'USDT')
    .eq('network_name', 'Tron')
    .single();
  if (error) throw error;
  return data.id as string;
}

main().catch((err) => {
  console.error('✗ FALLÓ:', err.message || err);
  process.exit(1);
});
