import { useState, type ChangeEvent, type FormEvent } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { Modal } from '../components/ui/Modal';
import { useCommissionRules, useUpsertCommissionRule } from '../lib/api/hooks';
import { fmtNumber, fmtPercent } from '../lib/format';

export function CommissionsPage() {
  const { data: rules, isLoading } = useCommissionRules();
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      <PageHeader
        title="Comisiones"
        subtitle="Configuración por defecto — cada operación guarda el valor que realmente se usó, cambiar una regla aquí no recalcula operaciones pasadas"
        actions={
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            + Nueva regla
          </button>
        }
      />

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Módulo</th>
              <th>Alcance</th>
              <th>Tipo</th>
              <th className="num">Fija</th>
              <th className="num">%</th>
              <th className="num">Spread default</th>
              <th>Activa</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} style={{ color: 'var(--text-mute)' }}>
                  Cargando…
                </td>
              </tr>
            )}
            {rules?.map((r: any) => (
              <tr key={r.id}>
                <td style={{ textTransform: 'capitalize' }}>{r.module}</td>
                <td>{r.scope ?? 'general'}</td>
                <td>{r.kind}</td>
                <td className="num">{fmtNumber(r.fixed_amount)}</td>
                <td className="num">{fmtPercent(r.percent)}</td>
                <td className="num">{fmtNumber(r.default_spread, 4)}</td>
                <td>
                  <span className={`badge ${r.active ? 'badge-completada' : 'badge-cancelada'}`}>{r.active ? 'Sí' : 'No'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nueva regla de comisión">
        <CommissionForm onDone={() => setShowForm(false)} />
      </Modal>
    </div>
  );
}

function CommissionForm({ onDone }: { onDone: () => void }) {
  const { mutate: upsert, isPending, error } = useUpsertCommissionRule();
  const [form, setForm] = useState({
    module: 'transferencia',
    scope: '',
    kind: 'porcentual',
    fixed_amount: '0',
    percent: '0',
    default_spread: '0',
  });
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    upsert(
      {
        module: form.module,
        scope: form.scope || null,
        kind: form.kind,
        fixed_amount: Number(form.fixed_amount),
        percent: Number(form.percent),
        default_spread: Number(form.default_spread),
      },
      { onSuccess: onDone }
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="field">
        <label>Módulo</label>
        <select value={form.module} onChange={set('module')}>
          <option value="transferencia">Transferencia</option>
          <option value="cripto">Cripto</option>
          <option value="efectivo">Efectivo</option>
        </select>
      </div>
      <div className="field">
        <label>Alcance (código de moneda/cripto/proveedor — opcional)</label>
        <input value={form.scope} onChange={set('scope')} placeholder="general si se deja vacío" />
      </div>
      <div className="field">
        <label>Tipo</label>
        <select value={form.kind} onChange={set('kind')}>
          <option value="fija">Fija</option>
          <option value="porcentual">Porcentual</option>
          <option value="mixta">Mixta</option>
        </select>
      </div>
      <div className="grid-2">
        <div className="field">
          <label>Monto fijo</label>
          <input type="number" step="any" value={form.fixed_amount} onChange={set('fixed_amount')} />
        </div>
        <div className="field">
          <label>Porcentaje</label>
          <input type="number" step="any" value={form.percent} onChange={set('percent')} />
        </div>
      </div>
      <div className="field">
        <label>Spread por defecto</label>
        <input type="number" step="any" value={form.default_spread} onChange={set('default_spread')} />
      </div>
      {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{(error as Error).message}</div>}
      <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={isPending}>
        {isPending ? 'Guardando…' : 'Guardar regla'}
      </button>
    </form>
  );
}
