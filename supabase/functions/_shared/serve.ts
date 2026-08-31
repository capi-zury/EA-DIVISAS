// Puente Supabase Edge Function (Deno) → handlers agnósticos de src/lib/server.
// La lógica de negocio es la misma que compartía Netlify/Cloudflare; aquí
// solo se traduce Request/Response ↔ ServerRequest/ServerResponse y se
// inyectan las variables de entorno que Supabase provee automáticamente.
import type { ServerRequest, ServerResponse } from '../../../src/lib/server/types.ts';
import { jsonResponse, preflight } from './cors.ts';

type Handler = (req: ServerRequest) => Promise<ServerResponse>;

export function serveHandler(handler: Handler): void {
  Deno.serve(async (req: Request) => {
    const pre = preflight(req);
    if (pre) return pre;

    try {
      const res = await handler({
        method: req.method,
        rawBody: await req.text(),
        authHeader: req.headers.get('Authorization') ?? undefined,
        env: {
          SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
          VITE_SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
          SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
        },
      });
      return jsonResponse(res.status, res.body);
    } catch (err) {
      return jsonResponse(500, {
        error: 'Error interno del servidor.',
        details: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
