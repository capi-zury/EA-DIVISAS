import { useState, type ChangeEvent, type FormEvent } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { Modal } from '../components/ui/Modal';
import { useCreateReconciliation, useReconciliations } from '../lib/api/hooks';
import { fmtDateTime, fmtMoney } from '../lib/format';

export function ReconciliationPage() {
  const { data: reconciliations, isLoading } = useReconciliations();
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      <PageHeader
        title="Conciliación"
        subtitle="Esperado vs. real — el sistema marca la diferencia automáticamente"
        actions={
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            + Nueva conciliación
          </button>
        }
      />

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Contexto</th>
              <th>Fecha</th>
              <th className="num">Esperado</th>
              <th className="num">Real</th>
              <th className="num">Diferencia</th>
              <th>Estado</th>
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
            {!isLoading && (!reconciliations || reconciliations.length === 0) && (
              <tr>
                <td colSpan={6} style={{ color: 'var(--text-mute)' }}>
                  Sin conciliaciones todavía.
                </td>
              </tr>
            )}
            {reconciliations?.map((r: any) => (
              <tr key={r.id}>
                <td>{r.context}</td>
                <td>{fmtDateTime(r.created_at)}</td>
                <td className="num">{fmtMoney(r.expected_amount, r.currency_code ?? 'MXN')}</td>
                <td className="num">{fmtMoney(r.actual_amount, r.currency_code ?? 'MXN')}</td>
                <td className={`num ${Number(r.difference) === 0 ? '' : 'neg'}`}>{fmtMoney(r.difference, r.currency_code ?? 'MXN')}</td>
                <td>
                  <span
                    className={`badge ${r.status === 'conciliado' ? 'badge-completada' : r.status === 'diferencia' ? 'badge-cancelada' : 'badge-pendiente'}`}
                  >
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nueva conciliación">
        <ReconciliationForm onDone={() => setShowForm(false)} />
      </Modal>
    </div>
  );
}

function ReconciliationForm({ onDone }: { onDone: () => void }) {
  const { mutate: create, isPending, error } = useCreateReconciliation();
  const [form, setForm] = useState({ context: '', currency_code: 'MXN', expected_amount: '', actual_amount: '' });
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    create(
      { context: form.context, currency_code: form.currency_code, expected_amount: Number(form.expected_amount), actual_amount: Number(form.actual_amount) },
      { onSuccess: onDone }
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="field">
        <label>Contexto</label>
        <input required value={form.context} onChange={set('context')} placeholder='ej. "Corte de caja USD 2026-08-24"' />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="field">
          <label>Monto esperado</label>
          <input required type="number" step="any" value={form.expected_amount} onChange={set('expected_amount')} />
        </div>
        <div className="field">
          <label>Monto real</label>
          <input required type="number" step="any" value={form.actual_amount} onChange={set('actual_amount')} />
        </div>
      </div>
      {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{(error as Error).message}</div>}
      <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={isPending}>
        {isPending ? 'Guardando…' : 'Registrar'}
      </button>
    </form>
  );
}
