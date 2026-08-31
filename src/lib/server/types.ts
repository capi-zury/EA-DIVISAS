/**
 * Contrato agnóstico de plataforma para la lógica de servidor.
 *
 * Los 3 endpoints privilegiados (create-operation, admin-users,
 * import-operations) viven aquí como funciones puras `handle*(req) => res`.
 * Cada plataforma de hosting solo aporta un adaptador delgado:
 *   - Cloudflare Pages Functions: functions/api/*.ts
 *   - Netlify Functions:          netlify/functions/*.ts
 *
 * Así el día de mañana mover de host no toca ninguna regla de negocio.
 */

/** Variables de entorno del servidor. En Cloudflare llegan por `context.env`; en Node por `process.env`. */
export interface ServerEnv {
  VITE_SUPABASE_URL?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export interface ServerRequest {
  method: string;
  /** Cuerpo crudo sin parsear (JSON.parse se hace dentro del handler). */
  rawBody: string;
  /** Header Authorization tal cual (`Bearer <jwt>`), si vino. */
  authHeader?: string;
  env: ServerEnv;
}

export interface ServerResponse {
  status: number;
  body: unknown;
}

export function ok(body: unknown): ServerResponse {
  return { status: 200, body };
}

export function created(body: unknown): ServerResponse {
  return { status: 201, body };
}

export function fail(status: number, error: string, details?: string): ServerResponse {
  return { status, body: details ? { error, details } : { error } };
}
