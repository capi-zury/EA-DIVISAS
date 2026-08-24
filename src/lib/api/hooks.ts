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
      const { data, error } = await supabase.from('clients').select('*').order('name');
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
    mutationFn: async (input: { name: string; phone?: string; email?: string; country?: string; internal_reference?: string; notes?: string }) => {
      const { data, error } = await supabase.from('clients').insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
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
        .order('created_at', { ascending: false })
        .limit(200);
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
