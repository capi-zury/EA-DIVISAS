import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Modal } from '../../components/ui/Modal';
import { useClients, useCreateOperation, useCurrencies, useOperations, useProviders, useUpdateOperationStatus } from '../../lib/api/hooks';
import { fmtDateTime, fmtMoney } from '../../lib/format';
import { calcTransfer, toDisplayNumber } from '../../lib/calc-engine';
import { OPERATION_STATUS_LABELS, ALLOWED_TRANSITIONS, type OperationStatus } from '../../lib/domain/operation-status';

export function TransfersModulePage() {
  const { data: operations, isLoading } = useOperations('transferencia');
  const [showForm, setShowForm] = useState(false);

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
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} style={{ color: 'var(--text-mute)' }}>
                  Cargando…
                </td>
              </tr>
            )}
            {!isLoading && (!operations || operations.length === 0) && (
              <tr>
                <td colSpan={8} style={{ color: 'var(--text-mute)' }}>
                  Sin operaciones todavía.
                </td>
              </tr>
            )}
            {operations?.map((op: any) => (
              <TransferRow key={op.id} op={op} />
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nueva operación — Transferencia" width={640}>
        <TransferForm onDone={() => setShowForm(false)} />
      </Modal>
    </div>
  );
}

function TransferRow({ op }: { op: any }) {
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
    </tr>
  );
}

function TransferForm({ onDone }: { onDone: () => void }) {
  const { data: clients } = useClients();
  const { data: currencies } = useCurrencies();
  const { data: providers } = useProviders();
  const { mutate: createOperation, isPending, error } = useCreateOperation();

  const [form, setForm] = useState({
    clientId: '',
    providerId: '',
    contactPhone: '',
    countryOrigin: '',
    countryDestination: '',
    currencyOrigin: 'USD',
    currencyDestination: 'MXN',
    amountSent: '',
    buyRate: '',
    sellRate: '',
    commissionFixed: '0',
    commissionPercent: '0',
    providerCost: '0',
    bankCost: '0',
    additionalCost: '0',
    reference: '',
    observations: '',
  });

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

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
          <label>Monto enviado</label>
          <input required type="number" step="any" value={form.amountSent} onChange={set('amountSent')} />
        </div>
        <div className="field">
          <label>Proveedor</label>
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
          <label>Tipo de cambio de compra (costo real)</label>
          <input required type="number" step="any" value={form.buyRate} onChange={set('buyRate')} />
        </div>
        <div className="field">
          <label>Tipo de cambio de venta (aplicado al cliente)</label>
          <input required type="number" step="any" value={form.sellRate} onChange={set('sellRate')} />
        </div>

        <div className="field">
          <label>Comisión fija</label>
          <input type="number" step="any" value={form.commissionFixed} onChange={set('commissionFixed')} />
        </div>
        <div className="field">
          <label>Comisión % (sobre monto recibido)</label>
          <input type="number" step="any" value={form.commissionPercent} onChange={set('commissionPercent')} />
        </div>

        <div className="field">
          <label>Costo proveedor</label>
          <input type="number" step="any" value={form.providerCost} onChange={set('providerCost')} />
        </div>
        <div className="field">
          <label>Costo bancario</label>
          <input type="number" step="any" value={form.bankCost} onChange={set('bankCost')} />
        </div>

        <div className="field">
          <label>Costo adicional</label>
          <input type="number" step="any" value={form.additionalCost} onChange={set('additionalCost')} />
        </div>
        <div className="field">
          <label>Referencia</label>
          <input value={form.reference} onChange={set('reference')} />
        </div>
      </div>

      {preview && (
        <div className="card card-tight" style={{ background: 'var(--navy-850)', marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Cálculo automático
          </div>
          <PreviewRow label="Monto recibido" value={fmtMoney(toDisplayNumber(preview.amountReceived))} />
          <PreviewRow label="Spread cambiario" value={fmtMoney(toDisplayNumber(preview.spreadRevenue))} />
          <PreviewRow label="Comisión cobrada" value={fmtMoney(toDisplayNumber(preview.commissionAmount))} />
          <PreviewRow label="Utilidad neta" value={fmtMoney(toDisplayNumber(preview.netProfit))} tone={toDisplayNumber(preview.netProfit) >= 0 ? 'pos' : 'neg'} bold />
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
