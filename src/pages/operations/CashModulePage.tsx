import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Modal } from '../../components/ui/Modal';
import { Hint } from '../../components/ui/Hint';
import { useClients, useCreateOperation, useCurrencies, useOperations, useUpdateOperationStatus } from '../../lib/api/hooks';
import { fmtDateTime, fmtMoney, fmtNumber } from '../../lib/format';
import { calcCash, toDisplayNumber } from '../../lib/calc-engine';
import { OPERATION_STATUS_LABELS, ALLOWED_TRANSITIONS, type OperationStatus } from '../../lib/domain/operation-status';

export function CashModulePage() {
  const { data: operations, isLoading } = useOperations('efectivo');
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      <PageHeader
        title="Efectivo / Dólares"
        subtitle="Compra y venta de efectivo — spread = precio de venta − precio de compra"
        actions={
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            + Nueva operación
          </button>
        }
      />

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Folio</th>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Moneda</th>
              <th className="num">Cantidad</th>
              <th className="num">Precio compra</th>
              <th className="num">Precio venta</th>
              <th className="num">Utilidad neta</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={9} style={{ color: 'var(--text-mute)' }}>
                  Cargando…
                </td>
              </tr>
            )}
            {!isLoading && (!operations || operations.length === 0) && (
              <tr>
                <td colSpan={9} style={{ color: 'var(--text-mute)' }}>
                  Sin operaciones todavía.
                </td>
              </tr>
            )}
            {operations?.map((op: any) => (
              <CashRow key={op.id} op={op} />
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nueva operación — Efectivo" width={560}>
        <CashForm onDone={() => setShowForm(false)} />
      </Modal>
    </div>
  );
}

function CashRow({ op }: { op: any }) {
  const detail = op.cash_transactions;
  const { mutate: updateStatus, isPending } = useUpdateOperationStatus();
  const nextStates = ALLOWED_TRANSITIONS[op.status as OperationStatus] ?? [];

  return (
    <tr>
      <td className="mono">{op.folio}</td>
      <td>{fmtDateTime(op.created_at)}</td>
      <td>{op.clients?.name ?? '—'}</td>
      <td>
        <b>{detail?.currency_code}</b>
      </td>
      <td className="num">{fmtNumber(detail?.quantity)}</td>
      <td className="num">{fmtMoney(detail?.buy_price)}</td>
      <td className="num">{fmtMoney(detail?.sell_price)}</td>
      <td className={`num ${Number(op.net_profit) >= 0 ? 'pos' : 'neg'}`}>{fmtMoney(op.net_profit)}</td>
      <td>
        <span className={`badge badge-${op.status}`}>{OPERATION_STATUS_LABELS[op.status as OperationStatus]}</span>
        {nextStates.length > 0 && (
          <select
            style={{ width: 'auto', marginTop: 6, fontSize: 11.5, padding: '3px 6px' }}
            disabled={isPending}
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) updateStatus({ operationId: op.id, newStatus: e.target.value });
              e.target.value = '';
            }}
          >
            <option value="" disabled>
              Cambiar a…
            </option>
            {nextStates.map((s) => (
              <option key={s} value={s}>
                {OPERATION_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        )}
      </td>
    </tr>
  );
}

function CashForm({ onDone }: { onDone: () => void }) {
  const { data: clients } = useClients();
  const { data: currencies } = useCurrencies();
  const { mutate: createOperation, isPending, error } = useCreateOperation();

  const [form, setForm] = useState({
    clientId: '',
    currencyCode: 'USD',
    denomination: '',
    quantity: '',
    buyPrice: '',
    sellPrice: '',
    commissionFixed: '0',
    commissionPercent: '0',
    additionalCosts: '0',
    reference: '',
    observations: '',
  });

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const preview = useMemo(() => {
    const n = (v: string) => (v === '' ? 0 : Number(v));
    if (!form.quantity || !form.buyPrice || !form.sellPrice) return null;
    return calcCash({
      quantity: n(form.quantity),
      buyPrice: n(form.buyPrice),
      sellPrice: n(form.sellPrice),
      commissionFixed: n(form.commissionFixed),
      commissionPercent: n(form.commissionPercent),
      additionalCosts: n(form.additionalCosts),
    });
  }, [form]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createOperation(
      {
        module: 'efectivo',
        header: {
          client_id: form.clientId || null,
          reference: form.reference || null,
          observations: form.observations || null,
          status: 'completada',
        },
        details: {
          currencyCode: form.currencyCode,
          denomination: form.denomination || null,
          quantity: Number(form.quantity),
          buyPrice: Number(form.buyPrice),
          sellPrice: Number(form.sellPrice),
          commissionFixed: Number(form.commissionFixed),
          commissionPercent: Number(form.commissionPercent),
          additionalCosts: Number(form.additionalCosts),
        },
      },
      { onSuccess: onDone }
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="field">
          <label>Cliente</label>
          <select value={form.clientId} onChange={set('clientId')}>
            <option value="">— sin asignar —</option>
            {clients?.map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Moneda</label>
          <select value={form.currencyCode} onChange={set('currencyCode')}>
            {currencies?.map((c: any) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>¿Cuánto?</label>
          <input required type="number" step="any" placeholder="ej. 500" value={form.quantity} onChange={set('quantity')} />
          <Hint>Cuántos dólares (o de la moneda que sea) se compraron o vendieron.</Hint>
        </div>
        <div className="field">
          <label>Denominación (opcional)</label>
          <input value={form.denomination} onChange={set('denomination')} placeholder='ej. "billetes de 100"' />
        </div>

        <div className="field">
          <label>¿A cuánto lo compraste?</label>
          <input required type="number" step="any" value={form.buyPrice} onChange={set('buyPrice')} />
        </div>
        <div className="field">
          <label>¿A cuánto lo vendiste?</label>
          <input required type="number" step="any" value={form.sellPrice} onChange={set('sellPrice')} />
        </div>

        <div className="field">
          <label>Comisión fija (opcional)</label>
          <input type="number" step="any" placeholder="0" value={form.commissionFixed} onChange={set('commissionFixed')} />
        </div>
        <div className="field">
          <label>Comisión % (opcional)</label>
          <input type="number" step="any" placeholder="0" value={form.commissionPercent} onChange={set('commissionPercent')} />
        </div>

        <div className="field">
          <label>Otros costos (opcional)</label>
          <input type="number" step="any" placeholder="0" value={form.additionalCosts} onChange={set('additionalCosts')} />
        </div>
        <div className="field">
          <label>Referencia (opcional)</label>
          <input value={form.reference} onChange={set('reference')} placeholder="folio interno, número de orden, etc." />
        </div>
      </div>

      {preview && (
        <div className="card card-tight" style={{ background: 'var(--navy-850)', marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Esto es lo que va a ganar la empresa (se calcula solo)
          </div>
          <PreviewRow label="Diferencia por unidad" value={fmtMoney(toDisplayNumber(preview.spreadPerUnit))} />
          <PreviewRow label="Diferencia total" value={fmtMoney(toDisplayNumber(preview.spreadTotal))} />
          <PreviewRow label="Ganancia neta" value={fmtMoney(toDisplayNumber(preview.netProfit))} tone={toDisplayNumber(preview.netProfit) >= 0 ? 'pos' : 'neg'} bold />
        </div>
      )}

      {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{(error as Error).message}</div>}

      <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={isPending}>
        {isPending ? 'Guardando…' : 'Registrar operación'}
      </button>
    </form>
  );
}

function PreviewRow({ label, value, tone, bold }: { label: string; value: string; tone?: 'pos' | 'neg'; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
      <span style={{ color: 'var(--text-dim)' }}>{label}</span>
      <span className={`mono ${tone === 'pos' ? 'pos' : tone === 'neg' ? 'neg' : ''}`} style={{ fontWeight: bold ? 700 : 400 }}>
        {value}
      </span>
    </div>
  );
}
