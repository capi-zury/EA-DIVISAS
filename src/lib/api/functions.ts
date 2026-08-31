import { supabase } from '../supabase/client';

/**
 * Llama a una Edge Function de Supabase (create-operation, admin-users,
 * import-operations) pasando el JWT de la sesión actual — supabase-js lo
 * adjunta solo. La lógica de esos endpoints vive en src/lib/server/ y corre
 * dentro de Supabase (Deno).
 */
export async function callFunction<T>(name: string, body: unknown): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.access_token) throw new Error('No hay sesión activa.');

  const { data, error } = await supabase.functions.invoke<T>(name, {
    body: body as Record<string, unknown>,
  });

  if (error) {
    // El cuerpo JSON con { error, details } viene en la respuesta cruda.
    let message = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const j = (await ctx.json()) as { error?: string; details?: string };
        if (j?.error) message = `${j.error}${j.details ? ' — ' + j.details : ''}`;
      } catch {
        /* se queda el mensaje genérico */
      }
    }
    throw new Error(message);
  }

  return data as T;
}
