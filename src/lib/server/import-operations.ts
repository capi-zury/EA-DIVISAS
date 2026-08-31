/**
 * Importación de operaciones de TRANSFERENCIA desde una fuente externa
 * (Excel/CSV que sube un usuario, o el Google Sheet del equipo que el
 * sistema lee solo — nunca escribe de vuelta).
 *
 * Reglas que respeta, iguales a create-operation:
 *   - Verifica JWT + rol (super_admin/admin/operador).
 *   - Cada fila nace por el RPC divisas.create_transfer_operation, que corre
 *     dentro del motor de cálculo. Cero INSERT directo en operations.
 *   - Idempotente: si una fila ya se importó (misma import_key: UETR o hash),
 *     se marca "skipped" y no se duplica.
 *
 * El frontend puede mandar las filas por lotes (chunks): la primera llamada
 * omite batchId y recibe uno; las siguientes lo reenvían para acumular en el
 * mismo registro de divisas.import_batches.
 */
import {
  autoDetectMapping,
  buildCreatePayload,
  normalizeKey,
  normalizeRows,
} from '../import/transfer-import.ts';
import type { ColumnMapping, NormalizedTransferRow, RawRow } from '../import/transfer-import.ts';
import { getCallerProfile, getCallingUser, supabaseAdmin } from './supabase.ts';
import { importOperationsRequestSchema } from './schemas.ts';
import { fail, ok, type ServerRequest, type ServerResponse } from './types.ts';

const ALLOWED_ROLES = new Set(['super_admin', 'admin', 'operador']);

type RowStatus = 'created' | 'skipped' | 'error' | 'ready';

interface RowResult {
  row: number;
  status: RowStatus;
  folio?: string;
  operationId?: string;
  clientName?: string | null;
  willCreateClient?: boolean;
  amountUsd?: number | null;
  opStatus?: string;
  message?: string;
}

export async function handleImportOperations(req: ServerRequest): Promise<ServerResponse> {
  if (req.method !== 'POST') return fail(405, 'Método no permitido.');

  const user = await getCallingUser(req.authHeader, req.env);
  if (!user) return fail(401, 'No autenticado.');

  const profile = await getCallerProfile(user.id, req.env);
  if (!profile || !profile.active) return fail(403, 'Usuario inactivo o sin perfil.');
  if (!ALLOWED_ROLES.has(profile.role)) return fail(403, `Rol ${profile.role} no puede importar operaciones.`);

  let payload;
  try {
    payload = importOperationsRequestSchema.parse(JSON.parse(req.rawBody || '{}'));
  } catch (err) {
    return fail(400, 'Entrada inválida.', err instanceof Error ? err.message : String(err));
  }

  const admin = supabaseAdmin(req.env);
  const dryRun = payload.dryRun === true;

  // ---- Mapeo de columnas ----
  const headers = payload.rows.length ? Object.keys(payload.rows[0] as RawRow) : [];
  const mapping: ColumnMapping = payload.mapping ?? autoDetectMapping(headers);
  if (!mapping.montoUsd) {
    return fail(400, 'No se pudo identificar la columna de Monto USD. Revisa el mapeo de columnas.');
  }

  const normalized = normalizeRows(payload.rows as RawRow[], mapping);

  // ---- Deduplicación: qué import_keys ya existen ----
  const keys = [...new Set(normalized.map((r) => r.importKey))];
  const existingKeys = new Set<string>();
  for (let i = 0; i < keys.length; i += 200) {
    const chunk = keys.slice(i, i + 200);
    const { data, error } = await admin.from('operations').select('import_key').in('import_key', chunk);
    if (error) return fail(500, 'No se pudo verificar duplicados.', error.message);
    for (const r of data ?? []) if (r.import_key) existingKeys.add(r.import_key as string);
  }

  // ---- Resolución de clientes (match por nombre normalizado, crea si falta) ----
  const wantedClientKeys = new Map<string, string>(); // matchKey -> primera grafía vista
  for (const r of normalized) {
    if (!r.errors.length && r.clientMatchKey && r.clientName && !wantedClientKeys.has(r.clientMatchKey)) {
      wantedClientKeys.set(r.clientMatchKey, r.clientName);
    }
  }

  const clientIdByKey = new Map<string, string>();
  {
    const { data, error } = await admin.from('clients').select('id, name');
    if (error) return fail(500, 'No se pudieron leer los clientes.', error.message);
    for (const c of data ?? []) clientIdByKey.set(normalizeKey(c.name), c.id as string);
  }

  const newClientKeys = [...wantedClientKeys.keys()].filter((k) => !clientIdByKey.has(k));

  if (!dryRun && newClientKeys.length) {
    const toInsert = newClientKeys.map((k) => ({
      name: wantedClientKeys.get(k) as string,
      notes: 'Alta automática por importación de transferencias.',
    }));
    const { data, error } = await admin.from('clients').insert(toInsert).select('id, name');
    if (error) return fail(500, 'No se pudieron crear los clientes nuevos.', error.message);
    for (const c of data ?? []) clientIdByKey.set(normalizeKey(c.name), c.id as string);
  }

  // ---- Lote (solo en corrida real) ----
  let batchId = payload.batchId ?? null;
  if (!dryRun && !batchId) {
    const { data, error } = await admin
      .from('import_batches')
      .insert({
        source: payload.source,
        file_name: payload.fileName ?? null,
        sheet_id: payload.sheetId ?? null,
        triggered_by: user.id,
        is_scheduled: payload.isScheduled === true,
      })
      .select('id')
      .single();
    if (error) return fail(500, 'No se pudo crear el lote de importación.', error.message);
    batchId = data.id as string;
  }

  // ---- Procesa fila por fila ----
  const results: RowResult[] = [];
  let createdCount = 0;
  let skipped = 0;
  let errors = 0;
  let ready = 0;

  const clientIdFor = (r: NormalizedTransferRow) =>
    r.clientMatchKey ? clientIdByKey.get(r.clientMatchKey) ?? null : null;

  for (const r of normalized) {
    if (r.errors.length) {
      results.push({ row: r.rowNumber, status: 'error', message: r.errors.join(' ') });
      errors++;
      continue;
    }
    if (existingKeys.has(r.importKey)) {
      results.push({ row: r.rowNumber, status: 'skipped', message: 'Ya importada (misma UETR/clave).' });
      skipped++;
      continue;
    }

    if (dryRun) {
      results.push({
        row: r.rowNumber,
        status: 'ready',
        clientName: r.clientName,
        willCreateClient: !!r.clientMatchKey && newClientKeys.includes(r.clientMatchKey),
        amountUsd: r.amountUsd,
        opStatus: r.status,
        message: r.warnings.join(' ') || undefined,
      });
      ready++;
      continue;
    }

    const { header, details } = buildCreatePayload(r, {
      createdBy: user.id,
      clientId: clientIdFor(r),
      importSource: payload.source,
      importBatchId: batchId as string,
      countryOrigin: payload.countryOrigin,
      countryDestination: payload.countryDestination,
    });

    const { data, error } = await admin.rpc('create_transfer_operation', { p_header: header, p_details: details });
    if (error) {
      results.push({ row: r.rowNumber, status: 'error', message: error.message });
      errors++;
      continue;
    }
    existingKeys.add(r.importKey); // evita duplicar si la misma clave aparece 2 veces en el archivo
    createdCount++;
    results.push({
      row: r.rowNumber,
      status: 'created',
      folio: (data as { folio: string }).folio,
      operationId: (data as { id: string }).id,
      clientName: r.clientName,
      amountUsd: r.amountUsd,
      opStatus: r.status,
      message: r.warnings.join(' ') || undefined,
    });
  }

  // ---- Cierra / acumula el lote ----
  if (!dryRun && batchId) {
    const { data: prev } = await admin
      .from('import_batches')
      .select('total_rows, created_count, skipped_count, error_count, results')
      .eq('id', batchId)
      .single();

    const prevResults = Array.isArray(prev?.results) ? (prev?.results as RowResult[]) : [];
    await admin
      .from('import_batches')
      .update({
        total_rows: (prev?.total_rows ?? 0) + normalized.length,
        created_count: (prev?.created_count ?? 0) + createdCount,
        skipped_count: (prev?.skipped_count ?? 0) + skipped,
        error_count: (prev?.error_count ?? 0) + errors,
        results: [...prevResults, ...results].slice(-5000),
        finished_at: new Date().toISOString(),
      })
      .eq('id', batchId);
  }

  return ok({
    batchId,
    dryRun,
    summary: {
      total: normalized.length,
      created: createdCount,
      skipped,
      errors,
      ready,
      newClients: newClientKeys.length,
    },
    results,
  });
}
