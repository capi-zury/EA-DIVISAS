/**
 * Fija la contraseña de un usuario existente usando la service role key.
 * Uso:  node scripts/set-password.mjs <correo> <contraseña>
 * (los datos van por argumento, no se guardan en el repo)
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Uso: node scripts/set-password.mjs <correo> <contraseña (8+ caracteres)>');
  process.exit(1);
}
if (password.length < 8) {
  console.error('La contraseña debe tener al menos 8 caracteres.');
  process.exit(1);
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

let user = null;
for (let page = 1; page <= 20 && !user; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
  if (data.users.length < 200) break;
}

if (!user) {
  console.error(`No existe un usuario con el correo ${email}.`);
  process.exit(1);
}

const { error: updErr } = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
if (updErr) throw updErr;

const { data: profile } = await admin
  .schema('divisas')
  .from('profiles')
  .select('full_name, role, active')
  .eq('id', user.id)
  .single();

console.log(`✓ Contraseña actualizada para ${email}`);
console.log(`  rol: ${profile?.role ?? '¿sin perfil?'} · activo: ${profile?.active ?? '?'}`);
