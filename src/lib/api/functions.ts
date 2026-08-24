import { supabase } from '../supabase/client';

/** Llama a una Netlify Function pasando el JWT de la sesión actual. */
export async function callFunction<T>(name: string, body: unknown): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('No hay sesión activa.');

  const res = await fetch(`/.netlify/functions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error ? `${json.error}${json.details ? ' — ' + json.details : ''}` : `Error ${res.status}`);
  }
  return json as T;
}
