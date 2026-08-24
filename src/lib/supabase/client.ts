/**
 * Cliente de Supabase para el navegador. Usa EXCLUSIVAMENTE la clave
 * anon/publishable (segura para el frontend) — nunca importar la service
 * role key aquí. Todo el acceso a datos desde el navegador pasa por RLS.
 */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en el entorno (ver .env.example).');
}

export const supabase = createClient(url, anonKey, {
  db: { schema: 'divisas' },
});
