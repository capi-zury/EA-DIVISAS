import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Modal } from '../../components/ui/Modal';
import { Hint } from '../../components/ui/Hint';
import { AttachmentsSection } from '../../components/ui/AttachmentsSection';
import { DeleteOperationButton } from '../../components/operations/DeleteOperationButton';
import { useClients, useCreateOperation, useCurrencies, useOperations, useProviders, useUpdateCashOperation, useUpdateOperationStatus } from '../../lib/api/hooks';
import { useAuth } from '../../lib/auth/AuthContext';
import { fmtDate, fmtMoney, fmtNumber } from '../../lib/format';
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
      <td>{fmtDate(op.operation_date)}</td>
      <td>{op.clients?.name ?? '—'}</td>
      <td>
        <b>{detail?.currency_code}</b>
      </td>
      <td className="num">{fmtNumber(detail?.quantity)}</td>
      <td className="num">{detail?.buy_price === detail?.sell_price ? '—' : fmtMoney(detail?.buy_price)}</td>
      <td className="num">{detail?.buy_price === detail?.sell_price ? '—' : fmtMoney(detail?.sell_price)}</td>
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
  const { data: providers } = useProviders();
  const { mutate: createOperation, isPending: creating, error: createError } = useCreateOperation();
  const { mutate: updateOperation, isPending: updating, error: updateError } = useUpdateCashOperation();
  const isPending = creating || updating;
  const error = createError || updateError;

  // "simple": solo monto + % — para operaciones que no tienen precio de
  // compra/venta (efectivo en pesos, no cambio de divisa). Equivale a
  // calcCash con buyPrice = sellPrice = 1: el spread da cero y la única
  // ganancia es la comisión — misma fórmula, sin duplicar lógica.
  const initialMode: 'simple' | 'spread' =
    isEdit && detail && Number(detail.buy_price) !== Number(detail.sell_price) ? 'spread' : 'simple';
  const [mode, setMode] = useState<'simple' | 'spread'>(initialMode);

  // Modo RÁPIDO (por defecto en operaciones nuevas). El caso normal de efectivo:
  // EA no compra nada, solo vende y cobra un %. Se pide el monto de la operación
  // y el % que se cobra → la ganancia sale sola. "También me costó comprarlo"
  // es opcional (para las que sí tienen un costo de compra). El modo detallado
  // (precio de compra/venta, comisión fija, proveedor) queda detrás de un botón.
  // Al editar una operación existente se abre directo en detallado.
  const [detailed, setDetailed] = useState(isEdit);
  const [quickHasCost, setQuickHasCost] = useState(false);
  const [quick, setQuick] = useState({
    clientId: editOp?.client_id ?? '',
    currencyCode: detail?.currency_code ?? 'MXN',
    monto: '',
    pct: '',
    costo: '',
  });
  const setQ =
    (k: keyof typeof quick) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setQuick((q) => ({ ...q, [k]: e.target.value }));
  const quickMonto = quick.monto === '' ? 0 : Number(quick.monto);
  const quickPct = quick.pct === '' ? 0 : Number(quick.pct);
  const quickCost = quickHasCost && quick.costo !== '' ? Number(quick.costo) : 0;
  const quickReady = quickMonto > 0 && (quickPct > 0 || quickCost > 0);
  const quickPreview = useMemo(
    () =>
      calcCash({
        quantity: 1,
        // sin costo de compra declarado: buyPrice = sellPrice → spread 0, la
        // ganancia es solo la comisión. Con costo: la diferencia también cuenta.
        buyPrice: quickCost > 0 ? quickCost : quickMonto,
        sellPrice: quickMonto,
        commissionFixed: 0,
        commissionPercent: quickPct,
        additionalCosts: 0,
        providerCommissionPercent: 0,
      }),
    [quickMonto, quickPct, quickCost],
  );

  const [form, setForm] = useState({
    clientId: editOp?.client_id ?? '',
    currencyCode: detail?.currency_code ?? (initialMode === 'simple' ? 'MXN' : 'USD'),
    denomination: detail?.denomination ?? '',
    quantity: detail?.quantity != null ? String(detail.quantity) : '',
    buyPrice: detail?.buy_price != null ? String(detail.buy_price) : '',
    sellPrice: detail?.sell_price != null ? String(detail.sell_price) : '',
    commissionFixed: detail?.commission_fixed != null ? String(detail.commission_fixed) : '0',
    commissionPercent: detail?.commission_percent != null ? String(detail.commission_percent) : '0',
    additionalCosts: '0',
    providerId: detail?.provider_id ?? '',
    providerCommissionPercent: detail?.provider_commission_percent != null ? String(detail.provider_commission_percent) : '0',
    reference: editOp?.reference ?? '',
    observations: editOp?.observations ?? '',
  });

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const readOnly = isEdit && !canEdit;

  const effectiveBuyPrice = mode === 'simple' ? '1' : form.buyPrice;
  const effectiveSellPrice = mode === 'simple' ? '1' : form.sellPrice;

  const preview = useMemo(() => {
    const n = (v: string) => (v === '' ? 0 : Number(v));
    if (!form.quantity || !effectiveBuyPrice || !effectiveSellPrice) return null;
    return calcCash({
      quantity: n(form.quantity),
      buyPrice: n(effectiveBuyPrice),
      sellPrice: n(effectiveSellPrice),
      commissionFixed: n(form.commissionFixed),
      commissionPercent: n(form.commissionPercent),
      additionalCosts: n(form.additionalCosts),
      providerCommissionPercent: form.providerId ? n(form.providerCommissionPercent) : 0,
    });
  }, [form, effectiveBuyPrice, effectiveSellPrice]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!detailed) {
      if (!quickReady) return;
      createOperation(
        {
          module: 'efectivo',
          header: { client_id: quick.clientId || null, reference: null, observations: null, status: 'completada' },
          details: {
            currencyCode: quick.currencyCode,
            denomination: null,
            quantity: 1,
            buyPrice: quickCost > 0 ? quickCost : quickMonto,
            sellPrice: quickMonto,
            commissionFixed: 0,
            commissionPercent: quickPct,
            additionalCosts: 0,
            providerId: null,
            providerCommissionPercent: 0,
          },
        },
        { onSuccess: onDone },
      );
      return;
    }

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
            total_costs: toDisplayNumber(preview.cost) + Number(form.additionalCosts) + toDisplayNumber(preview.providerCommissionAmount),
            gross_profit: toDisplayNumber(preview.grossProfit),
            net_profit: toDisplayNumber(preview.netProfit),
            margin_percent: toDisplayNumber(preview.marginPercent),
          },
          details: {
            currency_code: form.currencyCode,
            denomination: form.denomination || null,
            quantity: Number(form.quantity),
            buy_price: Number(effectiveBuyPrice),
            sell_price: Number(effectiveSellPrice),
            commission_fixed: Number(form.commissionFixed),
            commission_percent: Number(form.commissionPercent),
            commission_amount: toDisplayNumber(preview.commissionAmount),
            spread_per_unit: toDisplayNumber(preview.spreadPerUnit),
            spread_total: toDisplayNumber(preview.spreadTotal),
            provider_id: form.providerId || null,
            provider_commission_percent: form.providerId ? Number(form.providerCommissionPercent) : 0,
            provider_commission_amount: toDisplayNumber(preview.providerCommissionAmount),
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
          buyPrice: Number(effectiveBuyPrice),
          sellPrice: Number(effectiveSellPrice),
          commissionFixed: Number(form.commissionFixed),
          commissionPercent: Number(form.commissionPercent),
          additionalCosts: Number(form.additionalCosts),
          providerId: form.providerId || null,
          providerCommissionPercent: form.providerId ? Number(form.providerCommissionPercent) : 0,
        },
      },
      { onSuccess: onDone }
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <fieldset disabled={readOnly} style={{ border: 'none', padding: 0, margin: 0 }}>

      {!detailed && (
        <>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 16px', lineHeight: 1.55 }}>
            En 10 segundos: <b>de cuánto es la operación</b> y <b>qué % cobras</b>. La ganancia sale sola.
          </p>
          <div className="grid-2">
            <div className="field">
              <label>Cliente (opcional)</label>
              <select value={quick.clientId} onChange={setQ('clientId')}>
                <option value="">— sin asignar —</option>
                {clients?.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Moneda</label>
              <select value={quick.currencyCode} onChange={setQ('currencyCode')}>
                {currencies?.map((c: any) => (
                  <option key={c.code} value={c.code}>{c.code}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label>¿De cuánto es la operación? (total en pesos)</label>
            <input autoFocus type="number" step="any" inputMode="decimal" placeholder="ej. 1000000" value={quick.monto} onChange={setQ('monto')} style={{ maxWidth: 280 }} />
          </div>
          <div className="field">
            <label>¿Qué % cobras?</label>
            <input type="number" step="any" inputMode="decimal" placeholder="ej. 1" value={quick.pct} onChange={setQ('pct')} style={{ maxWidth: 160 }} />
            <Hint>Ej. 1% de $1,000,000 = $10,000 de ganancia.</Hint>
          </div>

          {!quickHasCost ? (
            <button
              type="button"
              onClick={() => setQuickHasCost(true)}
              style={{ background: 'none', border: 'none', color: 'var(--electric-bright)', cursor: 'pointer', fontSize: 13, padding: '2px 0 10px' }}
            >
              + Esta vez sí me costó comprarlo
            </button>
          ) : (
            <div className="field">
              <label>¿Cuánto te costó a ti? (total en pesos)</label>
              <input type="number" step="any" inputMode="decimal" placeholder="ej. 985000" value={quick.costo} onChange={setQ('costo')} style={{ maxWidth: 280 }} />
              <div style={{ fontSize: 11.5, color: 'var(--text-mute)', marginTop: 4 }}>
                Déjalo vacío si no te costó nada.{' '}
                <button type="button" onClick={() => { setQuickHasCost(false); setQuick((q) => ({ ...q, costo: '' })); }} style={{ background: 'none', border: 'none', color: 'var(--electric-bright)', cursor: 'pointer', fontSize: 11.5, padding: 0 }}>
                  quitar
                </button>
              </div>
            </div>
          )}

          <div
            className="card card-tight"
            style={{
              background: 'var(--navy-850)',
              border: `1px solid ${quickReady ? (toDisplayNumber(quickPreview.netProfit) >= 0 ? 'var(--green-dim)' : 'var(--red-dim)') : 'var(--border)'}`,
              margin: '4px 0 16px',
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Ganancia de esta operación (se calcula solo)
            </div>
            {quickReady ? (
              <>
                <PreviewRow label="Operación" value={fmtMoney(quickMonto)} />
                {quickPct > 0 && (
                  <PreviewRow label={`Comisión (${quickPct}%)`} value={fmtMoney(toDisplayNumber(quickPreview.commissionAmount))} />
                )}
                {quickCost > 0 && (
                  <>
                    <PreviewRow label="Te costó" value={fmtMoney(quickCost)} />
                    <PreviewRow label="Diferencia" value={fmtMoney(quickMonto - quickCost)} />
                  </>
                )}
                <PreviewRow
                  label="Ganancia"
                  value={fmtMoney(toDisplayNumber(quickPreview.netProfit))}
                  tone={toDisplayNumber(quickPreview.netProfit) >= 0 ? 'pos' : 'neg'}
                  bold
                />
                <div style={{ fontSize: 12, fontWeight: 600, marginTop: 6, color: toDisplayNumber(quickPreview.netProfit) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {toDisplayNumber(quickPreview.netProfit) > 0
                    ? '✓ Ganas dinero'
                    : toDisplayNumber(quickPreview.netProfit) < 0
                      ? '✕ Pierdes dinero'
                      : 'Ni ganas ni pierdes'}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12.5, color: 'var(--text-mute)' }}>Escribe el monto y el % y aquí verás la ganancia al instante.</div>
            )}
          </div>

          {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{(error as Error).message}</div>}

          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={isPending || !quickReady}>
            {isPending ? 'Guardando…' : 'Registrar operación'}
          </button>
          <button
            type="button"
            onClick={() => setDetailed(true)}
            style={{ background: 'none', border: 'none', color: 'var(--electric-bright)', cursor: 'pointer', fontSize: 13, padding: '10px 0 0' }}
          >
            + Modo detallado (precio de compra/venta, comisiones, proveedor…)
          </button>
        </>
      )}

      <div hidden={!detailed}>
      {!isEdit && (
        <button
          type="button"
          onClick={() => setDetailed(false)}
          style={{ background: 'none', border: 'none', color: 'var(--electric-bright)', cursor: 'pointer', fontSize: 13, padding: '0 0 12px' }}
        >
          ← Volver al modo rápido
        </button>
      )}
      <div style={{ display: 'flex', gap: 4, background: 'var(--navy-850)', border: '1px solid var(--border)', borderRadius: 8, padding: 3, marginBottom: 16 }}>
        <ModeButton active={mode === 'simple'} onClick={() => setMode('simple')}>
          Comisión simple (monto + %)
        </ModeButton>
        <ModeButton active={mode === 'spread'} onClick={() => setMode('spread')}>
          Compra y venta (con tipo de cambio)
        </ModeButton>
      </div>

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

        {mode === 'simple' ? (
          <div className="field">
            <label>Monto de la operación</label>
            <input required type="number" step="any" placeholder="ej. 1000000" value={form.quantity} onChange={set('quantity')} />
            <Hint>El total en efectivo de la operación. La ganancia sale solo de la comisión que captures abajo.</Hint>
          </div>
        ) : (
          <>
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
          </>
        )}

        <div className="field">
          <label>Comisión fija (opcional)</label>
          <input type="number" step="any" placeholder="0" value={form.commissionFixed} onChange={set('commissionFixed')} />
        </div>
        <div className="field">
          <label>Comisión % {mode === 'simple' ? '' : '(opcional)'}</label>
          <input type="number" step="any" placeholder="ej. 1" value={form.commissionPercent} onChange={set('commissionPercent')} />
          {mode === 'simple' && <Hint>Ej. 1% de $1,000,000 = $10,000 de comisión.</Hint>}
        </div>

        <div className="field">
          <label>Proveedor (opcional)</label>
          <select value={form.providerId} onChange={set('providerId')}>
            <option value="">— sin proveedor, toda la ganancia es nuestra —</option>
            {providers?.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>% de la comisión que se lleva el proveedor</label>
          <input
            type="number"
            step="any"
            placeholder="0"
            value={form.providerCommissionPercent}
            onChange={set('providerCommissionPercent')}
            disabled={!form.providerId}
          />
          <Hint>{form.providerId ? 'Del total de la comisión cobrada, este % es para el proveedor — el resto es nuestro.' : 'Elige un proveedor arriba para repartir la comisión con él.'}</Hint>
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
          <PreviewRow label="Comisión cobrada (total)" value={fmtMoney(toDisplayNumber(preview.commissionAmount))} />
          {mode === 'spread' && (
            <>
              <PreviewRow label="Diferencia por unidad" value={fmtMoney(toDisplayNumber(preview.spreadPerUnit))} />
              <PreviewRow label="Diferencia total" value={fmtMoney(toDisplayNumber(preview.spreadTotal))} />
            </>
          )}
          {form.providerId && (
            <>
              <PreviewRow label="Ganancia del proveedor" value={fmtMoney(toDisplayNumber(preview.providerCommissionAmount))} />
              <PreviewRow label="Ganancia nuestra (de la comisión)" value={fmtMoney(toDisplayNumber(preview.ourCommissionAmount))} />
            </>
          )}
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
      </div>
      </fieldset>

      {isEdit && (
        <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
          <AttachmentsSection operationId={editOp.id} />
        </div>
      )}

      {isEdit && canEdit && (
        <DeleteOperationButton operationId={editOp.id} module="efectivo" onDeleted={onDone} />
      )}
    </form>
  );
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        border: 'none',
        borderRadius: 6,
        padding: '7px 10px',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        color: active ? '#fff' : 'var(--text-dim)',
        background: active ? 'var(--electric)' : 'transparent',
      }}
    >
      {children}
    </button>
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
