/**
 * Lista los usuarios de Auth + su rol/estado en divisas.profiles.
 * Uso:  node scripts/list-users.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
if (error) throw error;

const { data: profiles } = await admin.schema('divisas').from('profiles').select('id, full_name, role, active');
const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

console.table(
  data.users.map((u) => ({
    email: u.email,
    rol: byId.get(u.id)?.role ?? '(sin perfil)',
    activo: byId.get(u.id)?.active ?? '',
    ultimo_acceso: u.last_sign_in_at ?? 'nunca',
  })),
);
