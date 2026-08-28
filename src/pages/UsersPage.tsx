import { useState, type ChangeEvent, type FormEvent } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { Modal } from '../components/ui/Modal';
import { useCreateUser, useProfiles, useUpdateProfileRole } from '../lib/api/hooks';
import { useAuth } from '../lib/auth/AuthContext';

const ROLES = ['super_admin', 'admin', 'operador', 'auditor'] as const;

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super admin — acceso total, incluye gestionar usuarios',
  admin: 'Admin — todo salvo gestionar usuarios',
  operador: 'Operador — registra operaciones y cambia estado',
  auditor: 'Auditor — solo lectura de operaciones y auditoría',
};

function fmtDate(value?: string) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function UsersPage() {
  const { data: profiles, isLoading } = useProfiles();
  const { mutate: updateRole, error: updateError } = useUpdateProfileRole();
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      <PageHeader
        title="Usuarios"
        subtitle="Roles y accesos del sistema"
        actions={
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            + Nuevo usuario
          </button>
        }
      />

      {updateError && (
        <div className="card" style={{ color: 'var(--red)', fontSize: 13, marginBottom: 16 }}>
          No se pudo guardar el cambio: {(updateError as Error).message}
        </div>
      )}

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Alta</th>
              <th>Activo</th>
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
            {!isLoading && profiles?.length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: 'var(--text-mute)' }}>
                  Sin usuarios.
                </td>
              </tr>
            )}
            {profiles?.map((p: any) => (
              <tr key={p.id}>
                <td style={{ fontWeight: 500 }}>
                  {p.full_name} {p.id === user?.id && <span style={{ color: 'var(--text-mute)', fontWeight: 400 }}>(tú)</span>}
                </td>
                <td style={{ color: 'var(--text-dim)' }}>{p.email ?? '—'}</td>
                <td>
                  <select
                    style={{ width: 'auto', fontSize: 12.5, padding: '5px 8px' }}
                    value={p.role}
                    onChange={(e) => updateRole({ id: p.id, role: e.target.value })}
                    disabled={p.id === user?.id}
                    title={ROLE_LABEL[p.role]}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={{ color: 'var(--text-dim)', fontSize: 12.5 }}>{fmtDate(p.created_at)}</td>
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

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nuevo usuario">
        <NewUserForm onDone={() => setShowForm(false)} />
      </Modal>
    </div>
  );
}

function NewUserForm({ onDone }: { onDone: () => void }) {
  const { mutate: createUser, isPending, error } = useCreateUser();
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'operador' });
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createUser(form, { onSuccess: onDone });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="field">
        <label>Nombre completo</label>
        <input required value={form.full_name} onChange={set('full_name')} />
      </div>
      <div className="field">
        <label>Correo</label>
        <input type="email" required value={form.email} onChange={set('email')} />
      </div>
      <div className="field">
        <label>Contraseña temporal</label>
        <input type="text" required minLength={8} value={form.password} onChange={set('password')} placeholder="mínimo 8 caracteres" />
        <div style={{ color: 'var(--text-mute)', fontSize: 12, marginTop: 4 }}>
          El usuario podrá usarla para entrar; conviene que la cambie después.
        </div>
      </div>
      <div className="field">
        <label>Rol</label>
        <select value={form.role} onChange={set('role')}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <div style={{ color: 'var(--text-mute)', fontSize: 12, marginTop: 4 }}>{ROLE_LABEL[form.role]}</div>
      </div>
      {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{(error as Error).message}</div>}
      <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={isPending}>
        {isPending ? 'Creando…' : 'Crear usuario'}
      </button>
    </form>
  );
}
