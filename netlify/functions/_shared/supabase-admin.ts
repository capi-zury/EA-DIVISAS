/**
 * Cliente Supabase con la service role key — SOLO se importa desde
 * Netlify Functions (código de servidor). Nunca desde src/ (frontend).
 */
import { createClient } from '@supabase/supabase-js';

export function supabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Faltan variables de entorno del servidor: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.');
  }
  return createClient(url, key, {
    db: { schema: 'divisas' },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Identifica al usuario que llama a partir del Bearer token del header Authorization. */
export async function getCallingUser(authHeader: string | undefined) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

export type ProfileRole = 'super_admin' | 'admin' | 'operador' | 'auditor';

export async function getCallerProfile(userId: string) {
  const admin = supabaseAdmin();
  const { data, error } = await admin.from('profiles').select('id, role, active, full_name').eq('id', userId).single();
  if (error || !data) return null;
  return data as { id: string; role: ProfileRole; active: boolean; full_name: string };
}
