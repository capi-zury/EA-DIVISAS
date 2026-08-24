import { useState, type ChangeEvent, type FormEvent } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { Modal } from '../components/ui/Modal';
import { useCreateProvider, useProviders } from '../lib/api/hooks';

export function ProvidersPage() {
  const { data: providers, isLoading } = useProviders();
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      <PageHeader
        title="Proveedores"
        subtitle="Exchanges, bancos y remesadoras usados para ejecutar operaciones"
        actions={
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            + Nuevo proveedor
          </button>
        }
      />

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Notas</th>
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
            {providers?.map((p: any) => (
              <tr key={p.id}>
                <td style={{ fontWeight: 500 }}>{p.name}</td>
                <td>{p.kind}</td>
                <td style={{ color: 'var(--text-dim)' }}>{p.notes ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nuevo proveedor">
        <ProviderForm onDone={() => setShowForm(false)} />
      </Modal>
    </div>
  );
}

function ProviderForm({ onDone }: { onDone: () => void }) {
  const { mutate: createProvider, isPending, error } = useCreateProvider();
  const [form, setForm] = useState({ name: '', kind: 'exchange', notes: '' });
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createProvider(form, { onSuccess: onDone });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="field">
        <label>Nombre</label>
        <input required value={form.name} onChange={set('name')} />
      </div>
      <div className="field">
        <label>Tipo</label>
        <select value={form.kind} onChange={set('kind')}>
          <option value="exchange">Exchange</option>
          <option value="banco">Banco</option>
          <option value="remesadora">Remesadora</option>
          <option value="general">General</option>
        </select>
      </div>
      <div className="field">
        <label>Notas</label>
        <textarea rows={3} value={form.notes} onChange={set('notes')} />
      </div>
      {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{(error as Error).message}</div>}
      <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={isPending}>
        {isPending ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  );
}
