import { useState, type ChangeEvent, type FormEvent } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { Hint } from '../components/ui/Hint';
import { useAuth } from '../lib/auth/AuthContext';
import { useExchangeRateHistory, useExchangeRates, useUpsertExchangeRate } from '../lib/api/hooks';
import { fmtDateTime, fmtNumber } from '../lib/format';

export function ExchangeRatesPage() {
  const { profile } = useAuth();
  const canEdit = profile?.role === 'super_admin' || profile?.role === 'admin';
  const { data: rates, isLoading } = useExchangeRates();
  const { mutate: upsert, isPending, error } = useUpsertExchangeRate();
  const [selectedPair, setSelectedPair] = useState<string | null>(null);
  const { data: history } = useExchangeRateHistory(selectedPair);

  const [form, setForm] = useState({ pair: '', kind: 'fiat' as 'fiat' | 'cripto', buy_rate: '', sell_rate: '' });
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    upsert(
      { pair: form.pair.toUpperCase(), kind: form.kind, buy_rate: Number(form.buy_rate), sell_rate: Number(form.sell_rate) },
      { onSuccess: () => setForm({ pair: '', kind: 'fiat', buy_rate: '', sell_rate: '' }) }
    );
  }

  return (
    <div>
      <PageHeader title="Tipos de Cambio" subtitle="Editable manualmente — cada operación guarda su propio snapshot al momento de crearse" />

      <div className={canEdit ? 'sidebar-layout' : undefined} style={canEdit ? undefined : { display: 'grid', gap: 20 }}>
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Par</th>
                <th>Tipo</th>
                <th className="num">Compra</th>
                <th className="num">Venta</th>
                <th>Actualizado</th>
                <th>Fuente</th>
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
              {rates?.map((r: any) => (
                <tr key={r.id} onClick={() => setSelectedPair(r.pair)} style={{ cursor: 'pointer' }}>
                  <td style={{ fontWeight: 600 }}>{r.pair}</td>
                  <td>{r.kind}</td>
                  <td className="num">{fmtNumber(r.buy_rate, 4)}</td>
                  <td className="num">{fmtNumber(r.sell_rate, 4)}</td>
                  <td>{fmtDateTime(r.updated_at)}</td>
                  <td>{r.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canEdit && (
          <div className="card">
            <h3 style={{ fontSize: 14.5, marginBottom: 14 }}>Actualizar / crear</h3>
            <form onSubmit={handleSubmit}>
              <div className="field">
                <label>¿Qué monedas? (ej. USD/MXN)</label>
                <input required value={form.pair} onChange={set('pair')} placeholder="USD/MXN" />
                <Hint>Se escribe así: moneda que compras / moneda con la que pagas.</Hint>
              </div>
              <div className="field">
                <label>Tipo</label>
                <select value={form.kind} onChange={set('kind')}>
                  <option value="fiat">Dinero normal (dólares, euros...)</option>
                  <option value="cripto">Criptomoneda</option>
                </select>
              </div>
              <div className="field">
                <label>Precio al que compras</label>
                <input required type="number" step="any" value={form.buy_rate} onChange={set('buy_rate')} />
              </div>
              <div className="field">
                <label>Precio al que vendes</label>
                <input required type="number" step="any" value={form.sell_rate} onChange={set('sell_rate')} />
              </div>
              {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{(error as Error).message}</div>}
              <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={isPending}>
                {isPending ? 'Guardando…' : 'Guardar'}
              </button>
            </form>
          </div>
        )}
      </div>

      {selectedPair && history && (
        <div className="card" style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 14.5, marginBottom: 14 }}>Historial — {selectedPair}</h3>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th className="num">Compra anterior → nueva</th>
                <th className="num">Venta anterior → nueva</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h: any) => (
                <tr key={h.id}>
                  <td>{fmtDateTime(h.changed_at)}</td>
                  <td className="num">
                    {h.buy_rate_old != null ? fmtNumber(h.buy_rate_old, 4) : '—'} → {fmtNumber(h.buy_rate_new, 4)}
                  </td>
                  <td className="num">
                    {h.sell_rate_old != null ? fmtNumber(h.sell_rate_old, 4) : '—'} → {fmtNumber(h.sell_rate_new, 4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
