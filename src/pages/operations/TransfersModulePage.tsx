import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Modal } from '../../components/ui/Modal';
import { Hint } from '../../components/ui/Hint';
import { AttachmentsSection } from '../../components/ui/AttachmentsSection';
import { useClients, useCreateOperation, useCurrencies, useOperations, useProviders, useUpdateOperationStatus, useUpdateTransferOperation } from '../../lib/api/hooks';
import { useAuth } from '../../lib/auth/AuthContext';
import { fmtDateTime, fmtMoney } from '../../lib/format';
import { calcTransfer, toDisplayNumber } from '../../lib/calc-engine';
import { OPERATION_STATUS_LABELS, ALLOWED_TRANSITIONS, type OperationStatus } from '../../lib/domain/operation-status';

export function TransfersModulePage() {
  const { data: operations, isLoading } = useOperations('transferencia');
  const [showForm, setShowForm] = useState(false);
  const [detailOp, setDetailOp] = useState<any | null>(null);

  return (
    <div>
      <PageHeader
        title="Transferencias internacionales"
        subtitle="Tipo de cambio de compra y venta siempre separados — el spread y la comisión se calculan solos"
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
              <th>Ruta</th>
              <th className="num">Enviado</th>
              <th className="num">Recibido</th>
              <th className="num">Utilidad neta</th>
              <th>Estado</th>
              <th></th>
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
              <TransferRow key={op.id} op={op} onOpenDetail={() => setDetailOp(op)} />
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nueva operación — Transferencia" width={640}>
        <TransferForm onDone={() => setShowForm(false)} />
      </Modal>

      <Modal open={!!detailOp} onClose={() => setDetailOp(null)} title={`Operación ${detailOp?.folio ?? ''}`} width={640}>
        {detailOp && <TransferForm editOp={detailOp} onDone={() => setDetailOp(null)} />}
      </Modal>
    </div>
  );
}

function TransferRow({ op, onOpenDetail }: { op: any; onOpenDetail: () => void }) {
  const detail = op.international_transfers;
  const { mutate: updateStatus, isPending } = useUpdateOperationStatus();
  const nextStates = ALLOWED_TRANSITIONS[op.status as OperationStatus] ?? [];

  return (
    <tr>
      <td className="mono">{op.folio}</td>
      <td>{fmtDateTime(op.created_at)}</td>
      <td>{op.clients?.name ?? '—'}</td>
      <td>
        {detail?.country_origin} → {detail?.country_destination}
      </td>
      <td className="num">
        {fmtMoney(detail?.amount_sent, detail?.currency_origin)} <span style={{ color: 'var(--text-mute)' }}>{detail?.currency_origin}</span>
      </td>
      <td className="num">
        {fmtMoney(detail?.amount_received, detail?.currency_destination)} <span style={{ color: 'var(--text-mute)' }}>{detail?.currency_destination}</span>
      </td>
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

function TransferForm({ onDone, editOp }: { onDone: () => void; editOp?: any }) {
  const { profile } = useAuth();
  const canEdit = profile && ['super_admin', 'admin'].includes(profile.role);
  const isEdit = !!editOp;
  const detail = editOp?.international_transfers;

  const { data: clients } = useClients();
  const { data: currencies } = useCurrencies();
  const { data: providers } = useProviders();
  const { mutate: createOperation, isPending: creating, error: createError } = useCreateOperation();
  const { mutate: updateOperation, isPending: updating, error: updateError } = useUpdateTransferOperation();
  const isPending = creating || updating;
  const error = createError || updateError;

  const [form, setForm] = useState({
    clientId: editOp?.client_id ?? '',
    providerId: editOp?.provider_id ?? '',
    contactPhone: detail?.contact_phone ?? '',
    countryOrigin: detail?.country_origin ?? '',
    countryDestination: detail?.country_destination ?? '',
    currencyOrigin: detail?.currency_origin ?? 'USD',
    currencyDestination: detail?.currency_destination ?? 'MXN',
    amountSent: detail?.amount_sent != null ? String(detail.amount_sent) : '',
    buyRate: detail?.buy_rate != null ? String(detail.buy_rate) : '',
    sellRate: detail?.sell_rate != null ? String(detail.sell_rate) : '',
    commissionFixed: detail?.commission_fixed != null ? String(detail.commission_fixed) : '0',
    commissionPercent: detail?.commission_percent != null ? String(detail.commission_percent) : '0',
    providerCost: detail?.provider_cost != null ? String(detail.provider_cost) : '0',
    bankCost: detail?.bank_cost != null ? String(detail.bank_cost) : '0',
    additionalCost: detail?.additional_cost != null ? String(detail.additional_cost) : '0',
    reference: editOp?.reference ?? '',
    observations: editOp?.observations ?? '',
  });

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const readOnly = isEdit && !canEdit;

  const preview = useMemo(() => {
    const n = (v: string) => (v === '' ? 0 : Number(v));
    if (!form.amountSent || !form.buyRate || !form.sellRate) return null;
    return calcTransfer({
      amountSent: n(form.amountSent),
      buyRate: n(form.buyRate),
      sellRate: n(form.sellRate),
      commissionFixed: n(form.commissionFixed),
      commissionPercent: n(form.commissionPercent),
      providerCost: n(form.providerCost),
      bankCost: n(form.bankCost),
      additionalCost: n(form.additionalCost),
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
            provider_id: form.providerId || null,
            reference: form.reference || null,
            observations: form.observations || null,
            gross_revenue: toDisplayNumber(preview.grossRevenue),
            total_costs: toDisplayNumber(preview.totalCosts),
            gross_profit: toDisplayNumber(preview.grossProfit),
            net_profit: toDisplayNumber(preview.netProfit),
            margin_percent: toDisplayNumber(preview.marginPercent),
          },
          details: {
            contact_phone: form.contactPhone || null,
            country_origin: form.countryOrigin,
            country_destination: form.countryDestination,
            currency_origin: form.currencyOrigin,
            currency_destination: form.currencyDestination,
            amount_sent: Number(form.amountSent),
            amount_received: toDisplayNumber(preview.amountReceived),
            exchange_rate_applied: Number(form.sellRate),
            buy_rate: Number(form.buyRate),
            sell_rate: Number(form.sellRate),
            commission_fixed: Number(form.commissionFixed),
            commission_percent: Number(form.commissionPercent),
            commission_amount: toDisplayNumber(preview.commissionAmount),
            provider_cost: Number(form.providerCost),
            bank_cost: Number(form.bankCost),
            additional_cost: Number(form.additionalCost),
            spread_revenue: toDisplayNumber(preview.spreadRevenue),
          },
        },
        { onSuccess: onDone }
      );
      return;
    }

    createOperation(
      {
        module: 'transferencia',
        header: {
          client_id: form.clientId || null,
          provider_id: form.providerId || null,
          reference: form.reference || null,
          observations: form.observations || null,
          status: 'completada',
        },
        details: {
          contactPhone: form.contactPhone || null,
          countryOrigin: form.countryOrigin,
          countryDestination: form.countryDestination,
          currencyOrigin: form.currencyOrigin,
          currencyDestination: form.currencyDestination,
          amountSent: Number(form.amountSent),
          buyRate: Number(form.buyRate),
          sellRate: Number(form.sellRate),
          commissionFixed: Number(form.commissionFixed),
          commissionPercent: Number(form.commissionPercent),
          providerCost: Number(form.providerCost),
          bankCost: Number(form.bankCost),
          additionalCost: Number(form.additionalCost),
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
          <label>Teléfono de contacto</label>
          <input value={form.contactPhone} onChange={set('contactPhone')} />
        </div>

        <div className="field">
          <label>País origen</label>
          <input required value={form.countryOrigin} onChange={set('countryOrigin')} />
        </div>
        <div className="field">
          <label>País destino</label>
          <input required value={form.countryDestination} onChange={set('countryDestination')} />
        </div>

        <div className="field">
          <label>Moneda origen</label>
          <select value={form.currencyOrigin} onChange={set('currencyOrigin')}>
            {currencies?.map((c: any) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Moneda destino</label>
          <select value={form.currencyDestination} onChange={set('currencyDestination')}>
            {currencies?.map((c: any) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>¿Cuánto envió el cliente?</label>
          <input required type="number" step="any" placeholder="en la moneda de origen" value={form.amountSent} onChange={set('amountSent')} />
        </div>
        <div className="field">
          <label>¿Con qué proveedor? (opcional)</label>
          <select value={form.providerId} onChange={set('providerId')}>
            <option value="">— sin asignar —</option>
            {providers?.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>¿A cómo te costó el dólar (o la moneda)?</label>
          <input required type="number" step="any" value={form.buyRate} onChange={set('buyRate')} />
          <Hint>El tipo de cambio real que te costó a ti conseguir el dinero.</Hint>
        </div>
        <div className="field">
          <label>¿A cómo se lo cobraste al cliente?</label>
          <input required type="number" step="any" value={form.sellRate} onChange={set('sellRate')} />
          <Hint>El tipo de cambio que usaste para calcular cuánto recibe el cliente.</Hint>
        </div>

        <div className="field">
          <label>Comisión fija que cobraste (opcional)</label>
          <input type="number" step="any" placeholder="0" value={form.commissionFixed} onChange={set('commissionFixed')} />
          <Hint>Un cobro fijo en pesos, aparte del tipo de cambio.</Hint>
        </div>
        <div className="field">
          <label>Comisión en % que cobraste (opcional)</label>
          <input type="number" step="any" placeholder="0" value={form.commissionPercent} onChange={set('commissionPercent')} />
          <Hint>Un porcentaje sobre el monto que recibe el cliente.</Hint>
        </div>

        <div className="field">
          <label>Costo del proveedor (opcional)</label>
          <input type="number" step="any" placeholder="0" value={form.providerCost} onChange={set('providerCost')} />
        </div>
        <div className="field">
          <label>Costo del banco (opcional)</label>
          <input type="number" step="any" placeholder="0" value={form.bankCost} onChange={set('bankCost')} />
        </div>

        <div className="field">
          <label>Otro costo (opcional)</label>
          <input type="number" step="any" placeholder="0" value={form.additionalCost} onChange={set('additionalCost')} />
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
          <PreviewRow label="Lo que recibe el cliente" value={fmtMoney(toDisplayNumber(preview.amountReceived))} />
          <PreviewRow label="Diferencia entre tipos de cambio" value={fmtMoney(toDisplayNumber(preview.spreadRevenue))} />
          <PreviewRow label="Comisión que cobraste" value={fmtMoney(toDisplayNumber(preview.commissionAmount))} />
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
