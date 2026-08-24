import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Modal } from '../../components/ui/Modal';
import { Hint } from '../../components/ui/Hint';
import { AttachmentsSection } from '../../components/ui/AttachmentsSection';
import { useClients, useCreateOperation, useCurrencies, useOperations, useUpdateCashOperation, useUpdateOperationStatus } from '../../lib/api/hooks';
import { useAuth } from '../../lib/auth/AuthContext';
import { fmtDateTime, fmtMoney, fmtNumber } from '../../lib/format';
import { calcCash, toDisplayNumber } from '../../lib/calc-engine';
import { OPERATION_STATUS_LABELS, ALLOWED_TRANSITIONS, type OperationStatus } from '../../lib/domain/operation-status';

export function CashModulePage() {
  const { data: operations, isLoading } = useOperations('efectivo');
  const [showForm, setShowForm] = useState(false);
  const [detailOp, setDetailOp] = useState<any | null>(null);

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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={10} style={{ color: 'var(--text-mute)' }}>
                  Cargando…
                </td>
              </tr>
            )}
            {!isLoading && (!operations || operations.length === 0) && (
              <tr>
                <td colSpan={10} style={{ color: 'var(--text-mute)' }}>
                  Sin operaciones todavía.
                </td>
              </tr>
            )}
            {operations?.map((op: any) => (
              <CashRow key={op.id} op={op} onOpenDetail={() => setDetailOp(op)} />
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nueva operación — Efectivo" width={560}>
        <CashForm onDone={() => setShowForm(false)} />
      </Modal>

      <Modal open={!!detailOp} onClose={() => setDetailOp(null)} title={`Operación ${detailOp?.folio ?? ''}`} width={560}>
        {detailOp && <CashForm editOp={detailOp} onDone={() => setDetailOp(null)} />}
      </Modal>
    </div>
  );
}

function CashRow({ op, onOpenDetail }: { op: any; onOpenDetail: () => void }) {
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
      <td>
        <button style={{ background: 'none', border: 'none', color: 'var(--electric-bright)', cursor: 'pointer', fontSize: 12.5 }} onClick={onOpenDetail}>
          Detalle
        </button>
      </td>
    </tr>
  );
}

function CashForm({ onDone, editOp }: { onDone: () => void; editOp?: any }) {
  const { profile } = useAuth();
  const canEdit = profile && ['super_admin', 'admin'].includes(profile.role);
  const isEdit = !!editOp;
  const detail = editOp?.cash_transactions;

  const { data: clients } = useClients();
  const { data: currencies } = useCurrencies();
  const { mutate: createOperation, isPending: creating, error: createError } = useCreateOperation();
  const { mutate: updateOperation, isPending: updating, error: updateError } = useUpdateCashOperation();
  const isPending = creating || updating;
  const error = createError || updateError;

  const [form, setForm] = useState({
    clientId: editOp?.client_id ?? '',
    currencyCode: detail?.currency_code ?? 'USD',
    denomination: detail?.denomination ?? '',
    quantity: detail?.quantity != null ? String(detail.quantity) : '',
    buyPrice: detail?.buy_price != null ? String(detail.buy_price) : '',
    sellPrice: detail?.sell_price != null ? String(detail.sell_price) : '',
    commissionFixed: detail?.commission_fixed != null ? String(detail.commission_fixed) : '0',
    commissionPercent: detail?.commission_percent != null ? String(detail.commission_percent) : '0',
    additionalCosts: '0',
    reference: editOp?.reference ?? '',
    observations: editOp?.observations ?? '',
  });

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const readOnly = isEdit && !canEdit;

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
    if (!preview) return;

    if (isEdit) {
      updateOperation(
        {
          operationId: editOp.id,
          header: {
            client_id: form.clientId || null,
            reference: form.reference || null,
            observations: form.observations || null,
            gross_revenue: toDisplayNumber(preview.revenue),
            total_costs: toDisplayNumber(preview.cost) + Number(form.additionalCosts),
            gross_profit: toDisplayNumber(preview.grossProfit),
            net_profit: toDisplayNumber(preview.netProfit),
            margin_percent: toDisplayNumber(preview.marginPercent),
          },
          details: {
            currency_code: form.currencyCode,
            denomination: form.denomination || null,
            quantity: Number(form.quantity),
            buy_price: Number(form.buyPrice),
            sell_price: Number(form.sellPrice),
            commission_fixed: Number(form.commissionFixed),
            commission_percent: Number(form.commissionPercent),
            commission_amount: toDisplayNumber(preview.commissionAmount),
            spread_per_unit: toDisplayNumber(preview.spreadPerUnit),
            spread_total: toDisplayNumber(preview.spreadTotal),
          },
        },
        { onSuccess: onDone }
      );
      return;
    }

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
      <fieldset disabled={readOnly} style={{ border: 'none', padding: 0, margin: 0 }}>
      <div className="grid-2">
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

      {readOnly ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-mute)', marginBottom: 12 }}>
          Solo un super_admin o admin puede corregir una operación ya creada.
        </div>
      ) : (
        <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={isPending}>
          {isPending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Registrar operación'}
        </button>
      )}
      </fieldset>

      {isEdit && (
        <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
          <AttachmentsSection operationId={editOp.id} />
        </div>
      )}
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
