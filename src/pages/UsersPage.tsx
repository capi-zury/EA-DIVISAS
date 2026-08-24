import { PageHeader } from '../components/ui/PageHeader';
import { useProfiles, useUpdateProfileRole } from '../lib/api/hooks';
import { useAuth } from '../lib/auth/AuthContext';

const ROLES = ['super_admin', 'admin', 'operador', 'auditor'] as const;

export function UsersPage() {
  const { data: profiles, isLoading } = useProfiles();
  const { mutate: updateRole } = useUpdateProfileRole();
  const { user } = useAuth();

  return (
    <div>
      <PageHeader title="Usuarios" subtitle="Roles y accesos del sistema" />

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Activo</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={3} style={{ color: 'var(--text-mute)' }}>
                  Cargando…
                </td>
              </tr>
            )}
            {profiles?.map((p: any) => (
              <tr key={p.id}>
                <td style={{ fontWeight: 500 }}>
                  {p.full_name} {p.id === user?.id && <span style={{ color: 'var(--text-mute)', fontWeight: 400 }}>(tú)</span>}
                </td>
                <td>
                  <select
                    style={{ width: 'auto', fontSize: 12.5, padding: '5px 8px' }}
                    value={p.role}
                    onChange={(e) => updateRole({ id: p.id, role: e.target.value })}
                    disabled={p.id === user?.id}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button
                    className={`btn ${p.active ? 'btn-ghost' : 'btn-primary'}`}
                    style={{ fontSize: 12, padding: '5px 10px' }}
                    disabled={p.id === user?.id}
                    onClick={() => updateRole({ id: p.id, active: !p.active })}
                  >
                    {p.active ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
