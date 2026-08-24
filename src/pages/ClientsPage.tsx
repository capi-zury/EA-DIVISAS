import { useState, type ChangeEvent, type FormEvent } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { Modal } from '../components/ui/Modal';
import { useClientSummary, useClients, useCommissioners, useCreateClient, useCreateCommissioner } from '../lib/api/hooks';
import { fmtDate, fmtDateTime, fmtMoney, fmtNumber } from '../lib/format';

const MODULE_LABELS: Record<string, string> = {
  transferencia: 'Transferencias',
  cripto: 'Cripto',
  efectivo: 'Efectivo',
};

export function ClientsPage() {
  const { data: clients, isLoading } = useClients();
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const { data: summary } = useClientSummary(selected);
  const selectedClient = clients?.find((c: any) => c.id === selected);

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle="Registro de clientes, su comisionista, y a qué categoría de negocio pertenecen"
        actions={
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            + Nuevo cliente
          </button>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 340px' : '1fr', gap: 20 }}>
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Teléfono</th>
                <th>Categoría</th>
                <th>Comisionista</th>
                <th>Estado</th>
                <th>Alta</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} style={{ color: 'var(--text-mute)' }}>
                    Cargando…
                  </td>
                </tr>
              )}
              {clients?.map((c: any) => (
                <tr key={c.id} onClick={() => setSelected(c.id)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td>{c.phone ?? '—'}</td>
                  <td>{c.primary_module ? <span className="role-badge">{MODULE_LABELS[c.primary_module]}</span> : '—'}</td>
                  <td>{c.commissioners?.name ?? '—'}</td>
                  <td>
                    <span className={`badge ${c.status === 'activo' ? 'badge-completada' : 'badge-cancelada'}`}>{c.status}</span>
                  </td>
                  <td>{fmtDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selected && summary && (
          <div className="card">
            <h3 style={{ fontSize: 15, marginBottom: 4 }}>{summary.name}</h3>
            {selectedClient?.primary_module && (
              <div style={{ marginBottom: 10 }}>
                <span className="role-badge">{MODULE_LABELS[selectedClient.primary_module]}</span>
              </div>
            )}
            {selectedClient?.commissioners?.name && (
              <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 14 }}>
                Comisionista: <span style={{ color: 'var(--text)' }}>{selectedClient.commissioners.name}</span>
              </div>
            )}
            <SummaryRow label="Operaciones" value={fmtNumber(summary.total_operations, 0)} />
            <SummaryRow label="Comisiones generadas" value={fmtMoney(summary.total_commissions)} />
            <SummaryRow label="Utilidad generada" value={fmtMoney(summary.total_profit)} />
            <SummaryRow label="Última operación" value={fmtDateTime(summary.last_operation_at)} />
            <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={() => setSelected(null)}>
              Cerrar
            </button>
          </div>
        )}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nuevo cliente">
        <ClientForm onDone={() => setShowForm(false)} />
      </Modal>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13.5 }}>
      <span style={{ color: 'var(--text-dim)' }}>{label}</span>
      <span className="mono">{value}</span>
    </div>
  );
}

function ClientForm({ onDone }: { onDone: () => void }) {
  const { mutate: createClient, isPending, error } = useCreateClient();
  const { data: commissioners } = useCommissioners();
  const [showNewCommissioner, setShowNewCommissioner] = useState(false);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    country: '',
    internal_reference: '',
    notes: '',
    commissioner_id: '',
    primary_module: '',
  });
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createClient(
      { ...form, commissioner_id: form.commissioner_id || null, primary_module: form.primary_module || null },
      { onSuccess: onDone }
    );
  }

  return (
    <>
    <form onSubmit={handleSubmit}>
      <div className="field">
        <label>Nombre</label>
        <input required value={form.name} onChange={set('name')} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="field">
          <label>Teléfono</label>
          <input value={form.phone} onChange={set('phone')} />
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" value={form.email} onChange={set('email')} />
        </div>
        <div className="field">
          <label>País</label>
          <input value={form.country} onChange={set('country')} />
        </div>
        <div className="field">
          <label>Referencia interna (opcional)</label>
          <input value={form.internal_reference} onChange={set('internal_reference')} />
        </div>

        <div className="field">
          <label>¿De qué es este cliente?</label>
          <select value={form.primary_module} onChange={set('primary_module')}>
            <option value="">— sin definir —</option>
            <option value="transferencia">Transferencias</option>
            <option value="cripto">Cripto</option>
            <option value="efectivo">Efectivo</option>
          </select>
        </div>
        <div className="field">
          <label>Comisionista</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={form.commissioner_id} onChange={set('commissioner_id')} style={{ flex: 1 }}>
              <option value="">— sin asignar —</option>
              {commissioners?.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-ghost" style={{ padding: '9px 12px' }} onClick={() => setShowNewCommissioner(true)}>
              + Nuevo
            </button>
          </div>
        </div>
      </div>
      <div className="field">
        <label>Notas</label>
        <textarea rows={3} value={form.notes} onChange={set('notes')} />
      </div>
      {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{(error as Error).message}</div>}
      <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={isPending}>
        {isPending ? 'Guardando…' : 'Guardar cliente'}
      </button>
    </form>

    <Modal open={showNewCommissioner} onClose={() => setShowNewCommissioner(false)} title="Nuevo comisionista" width={420}>
      <CommissionerForm
        onDone={(id) => {
          setForm((f) => ({ ...f, commissioner_id: id }));
          setShowNewCommissioner(false);
        }}
      />
    </Modal>
    </>
  );
}

function CommissionerForm({ onDone }: { onDone: (id: string) => void }) {
  const { mutate: createCommissioner, isPending, error } = useCreateCommissioner();
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createCommissioner(form, { onSuccess: (data: any) => onDone(data.id) });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="field">
        <label>Nombre</label>
        <input required value={form.name} onChange={set('name')} autoFocus />
      </div>
      <div className="field">
        <label>Teléfono (opcional)</label>
        <input value={form.phone} onChange={set('phone')} />
      </div>
      <div className="field">
        <label>Email (opcional)</label>
        <input type="email" value={form.email} onChange={set('email')} />
      </div>
      {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{(error as Error).message}</div>}
      <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={isPending}>
        {isPending ? 'Guardando…' : 'Guardar comisionista'}
      </button>
    </form>
  );
}
