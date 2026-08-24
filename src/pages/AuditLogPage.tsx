import { PageHeader } from '../components/ui/PageHeader';
import { useAuditLogs } from '../lib/api/hooks';
import { fmtDateTime } from '../lib/format';

export function AuditLogPage() {
  const { data: logs, isLoading } = useAuditLogs();

  return (
    <div>
      <PageHeader title="Auditoría" subtitle="Bitácora append-only — nadie puede editar ni borrar un registro de aquí" />

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Rol</th>
              <th>Acción</th>
              <th>Tabla</th>
              <th>Descripción / cambio</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} style={{ color: 'var(--text-mute)' }}>
                  Cargando…
                </td>
              </tr>
            )}
            {logs?.map((l: any) => (
              <tr key={l.id}>
                <td className="mono" style={{ fontSize: 12 }}>
                  {fmtDateTime(l.created_at)}
                </td>
                <td>
                  <span className="role-badge">{l.actor_role ?? '—'}</span>
                </td>
                <td style={{ textTransform: 'capitalize' }}>{l.action}</td>
                <td className="mono" style={{ fontSize: 12 }}>
                  {l.table_name}
                </td>
                <td style={{ fontSize: 12.5, color: 'var(--text-dim)', maxWidth: 420 }}>
                  {l.description ?? diffSummary(l.old_value, l.new_value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function diffSummary(oldValue: Record<string, unknown> | null, newValue: Record<string, unknown> | null): string {
  if (!oldValue || !newValue) return newValue ? 'Registro creado' : 'Registro eliminado';
  const changed = Object.keys(newValue).filter((k) => JSON.stringify(oldValue[k]) !== JSON.stringify(newValue[k]) && k !== 'updated_at');
  if (changed.length === 0) return '—';
  return changed.map((k) => `${k}: ${String(oldValue[k])} → ${String(newValue[k])}`).join(' · ');
}
