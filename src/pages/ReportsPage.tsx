import { useMemo, useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { useOperations } from '../lib/api/hooks';
import { fmtDateTime, fmtMoney } from '../lib/format';
import { OPERATION_STATUS_LABELS, type OperationStatus } from '../lib/domain/operation-status';

const MODULES = [
  { value: 'transferencia', label: 'Transferencias' },
  { value: 'cripto', label: 'Cripto' },
  { value: 'efectivo', label: 'Efectivo' },
] as const;

export function ReportsPage() {
  const [module, setModule] = useState<'transferencia' | 'cripto' | 'efectivo'>('cripto');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { data: operations } = useOperations(module);

  const filtered = useMemo(() => {
    return (operations ?? []).filter((op: any) => {
      if (from && op.operation_date < from) return false;
      if (to && op.operation_date > to) return false;
      return true;
    });
  }, [operations, from, to]);

  const rows = useMemo(
    () =>
      filtered.map((op: any) => ({
        Folio: op.folio,
        Fecha: op.operation_date,
        Cliente: op.clients?.name ?? '',
        Estado: OPERATION_STATUS_LABELS[op.status as OperationStatus],
        'Ingreso bruto': op.gross_revenue,
        'Costos totales': op.total_costs,
        'Utilidad bruta': op.gross_profit,
        'Utilidad neta': op.net_profit,
        'Margen %': op.margin_percent,
        Referencia: op.reference ?? '',
        Observaciones: op.observations ?? '',
      })),
    [filtered]
  );

  async function exportExcel() {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, module);
    XLSX.writeFile(wb, `EA-Divisas_${module}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function exportCsv() {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EA-Divisas_${module}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    window.print();
  }

  return (
    <div>
      <PageHeader title="Reportes" subtitle="Exporta operaciones por módulo y rango de fechas" />

      <div className="card" style={{ marginBottom: 20, display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="field" style={{ marginBottom: 0, width: 180 }}>
          <label>Módulo</label>
          <select value={module} onChange={(e) => setModule(e.target.value as typeof module)}>
            {MODULES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0, width: 160 }}>
          <label>Desde</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0, width: 160 }}>
          <label>Hasta</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <button className="btn" onClick={exportCsv}>
            CSV
          </button>
          <button className="btn" onClick={exportExcel}>
            Excel
          </button>
          <button className="btn" onClick={exportPdf}>
            PDF (imprimir)
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Folio</th>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Estado</th>
              <th className="num">Ingreso</th>
              <th className="num">Costos</th>
              <th className="num">Utilidad neta</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((op: any) => (
              <tr key={op.id}>
                <td className="mono">{op.folio}</td>
                <td>{fmtDateTime(op.created_at)}</td>
                <td>{op.clients?.name ?? '—'}</td>
                <td>
                  <span className={`badge badge-${op.status}`}>{OPERATION_STATUS_LABELS[op.status as OperationStatus]}</span>
                </td>
                <td className="num">{fmtMoney(op.gross_revenue)}</td>
                <td className="num">{fmtMoney(op.total_costs)}</td>
                <td className={`num ${Number(op.net_profit) >= 0 ? 'pos' : 'neg'}`}>{fmtMoney(op.net_profit)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{ color: 'var(--text-mute)' }}>
                  Sin operaciones en este rango.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
