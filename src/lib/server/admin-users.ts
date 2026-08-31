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
import { getCallerProfile, getCallingUser, supabaseAdmin } from './supabase';
import { createUserRequestSchema } from './schemas';
import { created, fail, type ServerRequest, type ServerResponse } from './types';

export async function handleAdminUsers(req: ServerRequest): Promise<ServerResponse> {
  if (req.method !== 'POST') return fail(405, 'Método no permitido.');

  const user = await getCallingUser(req.authHeader, req.env);
  if (!user) return fail(401, 'No autenticado.');

  const profile = await getCallerProfile(user.id, req.env);
  if (!profile || !profile.active) return fail(403, 'Usuario inactivo o sin perfil.');
  if (profile.role !== 'super_admin') return fail(403, 'Solo un super_admin puede crear usuarios.');

  let payload;
  try {
    payload = createUserRequestSchema.parse(JSON.parse(req.rawBody || '{}'));
  } catch (err) {
    return fail(400, 'Entrada inválida.', err instanceof Error ? err.message : String(err));
  }

  const admin = supabaseAdmin(req.env);

  const { data: createdUser, error: createErr } = await admin.auth.admin.createUser({
    email: payload.email,
    password: payload.password,
    email_confirm: true,
    user_metadata: { full_name: payload.full_name },
  });

  if (createErr || !createdUser?.user) {
    const msg = createErr?.message || 'No se pudo crear el usuario.';
    // Supabase responde 422 cuando el correo ya está registrado.
    const alreadyExists = /already been registered|already registered|already exists/i.test(msg);
    return fail(alreadyExists ? 409 : 400, alreadyExists ? 'Ya existe un usuario con ese correo.' : msg);
  }

  // El trigger handle_new_user() ya insertó el perfil (rol 'operador').
  // Ajustamos rol y nombre al valor pedido; el admin client ignora RLS.
  const { data: updatedProfile, error: profileErr } = await admin
    .from('profiles')
    .update({ role: payload.role, full_name: payload.full_name, updated_at: new Date().toISOString() })
    .eq('id', createdUser.user.id)
    .select('id, full_name, email, role, active, created_at')
    .single();

  if (profileErr) {
    // El usuario de auth quedó creado; revertimos para no dejar un usuario
    // a medias (sin perfil consistente) que además bloquearía reintentar
    // con el mismo correo.
    await admin.auth.admin.deleteUser(createdUser.user.id);
    return fail(500, 'No se pudo asignar el rol al nuevo usuario.', profileErr.message);
  }

  return created({ user: updatedProfile });
}
