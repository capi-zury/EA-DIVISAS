/**
 * Cliente Supabase con la service role key — SOLO servidor (adaptadores de
 * Cloudflare / Netlify y los handlers de src/lib/server). Nunca desde el
 * frontend en src/ que corre en el navegador.
 */
import { createClient } from '@supabase/supabase-js';
import type { ServerEnv } from './types.ts';

export type ProfileRole = 'super_admin' | 'admin' | 'operador' | 'auditor';

export function supabaseAdmin(env: ServerEnv) {
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Faltan variables de entorno del servidor: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.');
  }
  return createClient(url, key, {
    db: { schema: 'divisas' },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Identifica al usuario que llama a partir del Bearer token del header Authorization. */
export async function getCallingUser(authHeader: string | undefined, env: ServerEnv) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  const admin = supabaseAdmin(env);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

export async function getCallerProfile(userId: string, env: ServerEnv) {
  const admin = supabaseAdmin(env);
  const { data, error } = await admin.from('profiles').select('id, role, active, full_name').eq('id', userId).single();
  if (error || !data) return null;
  return data as { id: string; role: ProfileRole; active: boolean; full_name: string };
}
