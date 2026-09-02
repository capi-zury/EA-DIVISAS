import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase/client';
import { callFunction } from './functions';

// ---------- Catálogos ----------

export function useCurrencies() {
  return useQuery({
    queryKey: ['currencies'],
    queryFn: async () => {
      const { data, error } = await supabase.from('currencies').select('*').eq('active', true).order('code');
      if (error) throw error;
      return data;
    },
  });
}

export function useCryptoAssets() {
  return useQuery({
    queryKey: ['crypto_assets'],
    queryFn: async () => {
      const { data, error } = await supabase.from('crypto_assets').select('*').eq('active', true).order('code');
      if (error) throw error;
      return data;
    },
  });
}

export function useCryptoNetworks(assetCode: string | null) {
  return useQuery({
    queryKey: ['crypto_networks', assetCode],
    enabled: !!assetCode,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crypto_networks')
        .select('*')
        .eq('crypto_asset_code', assetCode!)
        .eq('active', true)
        .order('network_name');
      if (error) throw error;
      return data;
    },
  });
}

export function useProviders() {
  return useQuery({
    queryKey: ['providers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('providers').select('*').eq('active', true).order('name');
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; kind: string; notes?: string }) => {
      const { data, error } = await supabase.from('providers').insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['providers'] }),
  });
}

// ---------- Clientes ----------

export function useClients() {
  return useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('*, commissioners(name)').order('name');
      if (error) throw error;
      return data;
    },
  });
}

export function useClientSummary(clientId: string | null) {
  return useQuery({
    queryKey: ['client_summary', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase.from('client_summary').select('*').eq('client_id', clientId!).single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      phone?: string;
      email?: string;
      country?: string;
      internal_reference?: string;
      notes?: string;
      commissioner_id?: string | null;
      primary_module?: string | null;
    }) => {
      const { data, error } = await supabase.from('clients').insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
  });
}

// ---------- Comisionistas ----------

export function useCommissioners() {
  return useQuery({
    queryKey: ['commissioners'],
    queryFn: async () => {
      const { data, error } = await supabase.from('commissioners').select('*').eq('active', true).order('name');
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateCommissioner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; phone?: string; email?: string; notes?: string }) => {
      const { data, error } = await supabase.from('commissioners').insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commissioners'] }),
  });
}

export function useCommissionerSummary() {
  return useQuery({
    queryKey: ['commissioner_summary'],
    queryFn: async () => {
      const { data, error } = await supabase.from('commissioner_summary').select('*').order('total_profit', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

// ---------- Tipos de cambio ----------

export function useExchangeRates() {
  return useQuery({
    queryKey: ['exchange_rates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('exchange_rates').select('*').order('pair');
      if (error) throw error;
      return data;
    },
  });
}

export function useExchangeRateHistory(pair: string | null) {
  return useQuery({
    queryKey: ['exchange_rate_history', pair],
    enabled: !!pair,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exchange_rate_history')
        .select('*')
        .eq('pair', pair!)
        .order('changed_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertExchangeRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { pair: string; kind: 'fiat' | 'cripto'; buy_rate: number; sell_rate: number }) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user.id;
      const { data, error } = await supabase
        .from('exchange_rates')
        .upsert({ ...input, source: 'manual', updated_by: uid, updated_at: new Date().toISOString() }, { onConflict: 'pair' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exchange_rates'] });
      qc.invalidateQueries({ queryKey: ['exchange_rate_history'] });
    },
  });
}

// ---------- Operaciones ----------

const MODULE_DETAIL_TABLE: Record<string, string> = {
  transferencia: 'international_transfers(*)',
  cripto: 'crypto_transactions(*)',
  efectivo: 'cash_transactions(*)',
};

export function useOperations(module: 'transferencia' | 'cripto' | 'efectivo') {
  return useQuery({
    queryKey: ['operations', module],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('operations')
        .select(`*, clients(name), ${MODULE_DETAIL_TABLE[module]}`)
        .eq('module', module)
        // por fecha de la operación (la más reciente arriba); created_at solo
        // desempata cuando dos operaciones tienen la misma fecha.
        .order('operation_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data;
    },
  });
}

interface CreateOperationBody {
  module: 'transferencia' | 'cripto' | 'efectivo';
  header: Record<string, unknown>;
  details: Record<string, unknown>;
}

export function useCreateOperation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateOperationBody) => callFunction<{ operation: { id: string; folio: string }; calc: unknown }>('create-operation', body),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['operations', variables.module] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

// ---------- Importación de transferencias ----------

export interface ImportRowResult {
  row: number;
  status: 'created' | 'skipped' | 'error' | 'ready';
  folio?: string;
  operationId?: string;
  clientName?: string | null;
  willCreateClient?: boolean;
  amountUsd?: number | null;
  opStatus?: string;
  message?: string;
}

export interface ImportResponse {
  batchId: string | null;
  dryRun: boolean;
  summary: { total: number; created: number; skipped: number; errors: number; ready: number; newClients: number };
  results: ImportRowResult[];
}

export interface ImportRequest {
  source: 'excel' | 'google_sheet' | 'drive_xlsx';
  batchId?: string;
  fileName?: string | null;
  sheetId?: string | null;
  mapping?: Record<string, string>;
  rows?: Record<string, unknown>[];
  estadoCuenta?: {
    client: string;
    beneficiary: string;
    usd: number;
    tcVenta: number;
    tcCompra: number;
    comPct: number;
    comUsd: number;
    totalVenta: number;
    diferencia: number;
    date: string;
  }[];
  dryRun?: boolean;
  isScheduled?: boolean;
  countryOrigin?: string;
  countryDestination?: string;
  defaultStatus?: string;
}

export function useImportOperations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ImportRequest) => callFunction<ImportResponse>('import-operations', body),
    onSuccess: (data) => {
      if (data.dryRun) return;
      qc.invalidateQueries({ queryKey: ['operations', 'transferencia'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['import_batches'] });
    },
  });
}

export function useImportBatches() {
  return useQuery({
    queryKey: ['import_batches'],
    queryFn: async () => {
      const { data, error } = await supabase.from('import_batches').select('*').order('started_at', { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateOperationStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ operationId, newStatus, note }: { operationId: string; newStatus: string; note?: string }) => {
      const { data, error } = await supabase.rpc('update_operation_status', {
        p_operation_id: operationId,
        p_new_status: newStatus,
        p_note: note ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['operations'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

interface UpdateOperationBody {
  operationId: string;
  header: Record<string, unknown>;
  details: Record<string, unknown>;
}

function useUpdateOperationRpc(rpcName: 'update_transfer_operation' | 'update_crypto_operation' | 'update_cash_operation', module: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ operationId, header, details }: UpdateOperationBody) => {
      const { data, error } = await supabase.rpc(rpcName, { p_operation_id: operationId, p_header: header, p_details: details });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['operations', module] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['audit_logs'] });
    },
  });
}

/** Borrado DURO de una operación (RPC divisas.delete_operation, solo super_admin/admin). */
export function useDeleteOperation(module: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (operationId: string) => {
      const { error } = await supabase.rpc('delete_operation', { p_operation_id: operationId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['operations', module] });
      qc.invalidateQueries({ queryKey: ['operations'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['audit_logs'] });
    },
  });
}

export function useUpdateTransferOperation() {
  return useUpdateOperationRpc('update_transfer_operation', 'transferencia');
}

export function useUpdateCryptoOperation() {
  return useUpdateOperationRpc('update_crypto_operation', 'cripto');
}

export function useUpdateCashOperation() {
  return useUpdateOperationRpc('update_cash_operation', 'efectivo');
}

// ---------- Comprobantes (Supabase Storage) ----------

export function useAttachments(operationId: string | null) {
  return useQuery({
    queryKey: ['attachments', operationId],
    enabled: !!operationId,
    queryFn: async () => {
      const { data, error } = await supabase.from('attachments').select('*').eq('operation_id', operationId!).order('uploaded_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useUploadAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ operationId, file }: { operationId: string; file: File }) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user.id;
      const safeName = file.name.replace(/[^\w.\-]+/g, '_');
      const path = `${operationId}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage.from('attachments').upload(path, file, { contentType: file.type || undefined });
      if (uploadError) throw uploadError;

      const { data, error } = await supabase
        .from('attachments')
        .insert({ operation_id: operationId, file_path: path, file_name: file.name, file_type: file.type, file_size_bytes: file.size, uploaded_by: uid })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => qc.invalidateQueries({ queryKey: ['attachments', data.operation_id] }),
  });
}

export async function getAttachmentUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from('attachments').createSignedUrl(filePath, 300);
  if (error) throw error;
  return data.signedUrl;
}

export function useDeleteAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, filePath, operationId }: { id: string; filePath: string; operationId: string }) => {
      await supabase.storage.from('attachments').remove([filePath]);
      const { error } = await supabase.from('attachments').delete().eq('id', id);
      if (error) throw error;
      return operationId;
    },
    onSuccess: (operationId) => qc.invalidateQueries({ queryKey: ['attachments', operationId] }),
  });
}

// ---------- Dashboard ----------

export function useDashboardTotals() {
  return useQuery({
    queryKey: ['dashboard', 'daily_totals'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_daily_totals').select('*').order('operation_date', { ascending: false }).limit(400);
      if (error) throw error;
      return data;
    },
  });
}

export function useModuleTotals() {
  return useQuery({
    queryKey: ['dashboard', 'module_totals'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_module_totals').select('*').order('operation_date', { ascending: false }).limit(1000);
      if (error) throw error;
      return data;
    },
  });
}

export function useOperatorTotals() {
  return useQuery({
    queryKey: ['dashboard', 'operator_totals'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_operator_totals').select('*').order('operation_date', { ascending: false }).limit(1000);
      if (error) throw error;
      return data;
    },
  });
}

// ---------- Auditoría ----------

export function useAuditLogs(filters?: { tableName?: string }) {
  return useQuery({
    queryKey: ['audit_logs', filters],
    queryFn: async () => {
      let q = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(300);
      if (filters?.tableName) q = q.eq('table_name', filters.tableName);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

// ---------- Usuarios ----------

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('full_name');
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { full_name: string; email: string; password: string; role: string }) =>
      callFunction<{ user: { id: string; full_name: string; email: string; role: string; active: boolean } }>('admin-users', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles'] }),
  });
}

export function useUpdateProfileRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, role, active }: { id: string; role?: string; active?: boolean }) => {
      const patch: Record<string, unknown> = {};
      if (role !== undefined) patch.role = role;
      if (active !== undefined) patch.active = active;
      const { data, error } = await supabase.from('profiles').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles'] }),
  });
}

// ---------- Conciliación ----------

export function useReconciliations() {
  return useQuery({
    queryKey: ['reconciliations'],
    queryFn: async () => {
      const { data, error } = await supabase.from('reconciliations').select('*').order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateReconciliation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { context: string; currency_code?: string; expected_amount: number; actual_amount: number; operation_id?: string }) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user.id;
      const diff = input.actual_amount - input.expected_amount;
      const status = diff === 0 ? 'conciliado' : 'diferencia';
      const { data, error } = await supabase
        .from('reconciliations')
        .insert({ ...input, created_by: uid, status })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reconciliations'] }),
  });
}

// ---------- Comisiones / Fees ----------

export function useCommissionRules() {
  return useQuery({
    queryKey: ['commission_rules'],
    queryFn: async () => {
      const { data, error } = await supabase.from('commission_rules').select('*').order('module');
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertCommissionRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      module: string;
      scope?: string | null;
      kind: string;
      fixed_amount: number;
      percent: number;
      default_spread: number;
    }) => {
      const { data, error } = await supabase.from('commission_rules').upsert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commission_rules'] }),
  });
}
