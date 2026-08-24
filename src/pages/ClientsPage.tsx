import { useState, type ChangeEvent, type FormEvent } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { Modal } from '../components/ui/Modal';
import { useClientSummary, useClients, useCreateClient } from '../lib/api/hooks';
import { fmtDate, fmtDateTime, fmtMoney, fmtNumber } from '../lib/format';

export function ClientsPage() {
  const { data: clients, isLoading } = useClients();
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const { data: summary } = useClientSummary(selected);

  return (
    <div>
      <PageHeader
        title="Clientes"
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
                <th>País</th>
                <th>Estado</th>
                <th>Alta</th>
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
              {clients?.map((c: any) => (
                <tr key={c.id} onClick={() => setSelected(c.id)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td>{c.phone ?? '—'}</td>
                  <td>{c.country ?? '—'}</td>
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
            <h3 style={{ fontSize: 15, marginBottom: 14 }}>{summary.name}</h3>
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
  const [form, setForm] = useState({ name: '', phone: '', email: '', country: '', internal_reference: '', notes: '' });
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createClient(form, { onSuccess: onDone });
  }

  return (
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
          <label>Referencia interna</label>
          <input value={form.internal_reference} onChange={set('internal_reference')} />
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
  );
}
