/**
 * Alta de usuarios del sistema. Solo `super_admin`.
 *
 * Crear un usuario implica escribir en `auth.users` de Supabase, y eso
 * requiere la service role key — que nunca puede estar en el navegador.
 * Por eso el alta pasa por aquí:
 *   1. Verifica el JWT del que llama y que su rol sea super_admin.
 *   2. Crea el usuario en Supabase Auth (correo ya confirmado, sin mail de
 *      verificación — lo da de alta un administrador, no es autoservicio).
 *   3. El trigger divisas.handle_new_user() crea el perfil con rol
 *      'operador'; aquí se ajusta al rol pedido y se fija el full_name.
 *
 * El cambio de rol / activar-desactivar de un usuario que YA existe sigue
 * yendo directo por RLS (policy profiles_write_super_admin), no por aquí.
 */
import { getCallerProfile, getCallingUser, supabaseAdmin } from './_shared/supabase-admin';
import { createUserRequestSchema } from './_shared/schemas';

function json(statusCode: number, body: unknown) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export const handler = async (event: { httpMethod: string; body: string | null; headers: Record<string, string | undefined> }) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Método no permitido.' });
  }

  const user = await getCallingUser(event.headers.authorization || event.headers.Authorization);
  if (!user) return json(401, { error: 'No autenticado.' });

  const profile = await getCallerProfile(user.id);
  if (!profile || !profile.active) return json(403, { error: 'Usuario inactivo o sin perfil.' });
  if (profile.role !== 'super_admin') return json(403, { error: 'Solo un super_admin puede crear usuarios.' });

  let payload;
  try {
    payload = createUserRequestSchema.parse(JSON.parse(event.body || '{}'));
  } catch (err) {
    return json(400, { error: 'Entrada inválida.', details: err instanceof Error ? err.message : String(err) });
  }

  const admin = supabaseAdmin();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: payload.email,
    password: payload.password,
    email_confirm: true,
    user_metadata: { full_name: payload.full_name },
  });

  if (createErr || !created?.user) {
    const msg = createErr?.message || 'No se pudo crear el usuario.';
    // Supabase responde 422 cuando el correo ya está registrado.
    const alreadyExists = /already been registered|already registered|already exists/i.test(msg);
    return json(alreadyExists ? 409 : 400, {
      error: alreadyExists ? 'Ya existe un usuario con ese correo.' : msg,
    });
  }

  // El trigger handle_new_user() ya insertó el perfil (rol 'operador').
  // Ajustamos rol y nombre al valor pedido; el admin client ignora RLS.
  const { data: updatedProfile, error: profileErr } = await admin
    .from('profiles')
    .update({ role: payload.role, full_name: payload.full_name, updated_at: new Date().toISOString() })
    .eq('id', created.user.id)
    .select('id, full_name, email, role, active, created_at')
    .single();

  if (profileErr) {
    // El usuario de auth quedó creado; revertimos para no dejar un usuario
    // a medias (sin perfil consistente) que además bloquearía reintentar
    // con el mismo correo.
    await admin.auth.admin.deleteUser(created.user.id);
    return json(500, { error: 'No se pudo asignar el rol al nuevo usuario.', details: profileErr.message });
  }

  return json(201, { user: updatedProfile });
};
