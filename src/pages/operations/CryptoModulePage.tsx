import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Modal } from '../../components/ui/Modal';
import { useClients, useCreateOperation, useCryptoAssets, useCryptoNetworks, useOperations, useProviders, useUpdateOperationStatus } from '../../lib/api/hooks';
import { fmtDateTime, fmtMoney, fmtNumber, fmtPercent } from '../../lib/format';
import { calcCrypto, toDisplayNumber } from '../../lib/calc-engine';
import { OPERATION_STATUS_LABELS, ALLOWED_TRANSITIONS, type OperationStatus } from '../../lib/domain/operation-status';

export function CryptoModulePage() {
  const { data: operations, isLoading } = useOperations('cripto');
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      <PageHeader
        title="Cripto"
        subtitle="Compra/venta de criptomonedas — precio de mercado, compra, venta, spread y comisiones siempre separados"
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
              <th>Activo</th>
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
              <OperationRow key={op.id} op={op} />
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nueva operación — Cripto" width={640}>
        <CryptoForm onDone={() => setShowForm(false)} />
      </Modal>
    </div>
  );
}

function OperationRow({ op }: { op: any }) {
  const detail = op.crypto_transactions;
  const { mutate: updateStatus, isPending } = useUpdateOperationStatus();
  const nextStates = ALLOWED_TRANSITIONS[op.status as OperationStatus] ?? [];

  return (
    <tr>
      <td className="mono">{op.folio}</td>
      <td>{fmtDateTime(op.created_at)}</td>
      <td>{op.clients?.name ?? '—'}</td>
      <td>
        <b>{detail?.crypto_asset_code}</b>
      </td>
      <td className="num">{fmtNumber(detail?.quantity, 8)}</td>
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

function CryptoForm({ onDone }: { onDone: () => void }) {
  const { data: clients } = useClients();
  const { data: assets } = useCryptoAssets();
  const { data: providers } = useProviders();
  const { mutate: createOperation, isPending, error } = useCreateOperation();

  const [assetCode, setAssetCode] = useState('');
  const { data: networks } = useCryptoNetworks(assetCode || null);

  const [form, setForm] = useState({
    clientId: '',
    providerId: '',
    networkId: '',
    quantity: '',
    marketPrice: '',
    buyPrice: '',
    sellPrice: '',
    providerFeeBuy: '0',
    providerFeeSell: '0',
    networkFee: '0',
    customerFeeFixed: '0',
    customerFeePercent: '0',
    txHash: '',
    walletOrigin: '',
    walletDestination: '',
    reference: '',
    observations: '',
  });

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const preview = useMemo(() => {
    const n = (v: string) => (v === '' ? 0 : Number(v));
    if (!form.quantity || !form.buyPrice || !form.sellPrice) return null;
    return calcCrypto({
      quantity: n(form.quantity),
      marketPrice: n(form.marketPrice || form.buyPrice),
      buyPrice: n(form.buyPrice),
      sellPrice: n(form.sellPrice),
      providerFeeBuy: n(form.providerFeeBuy),
      providerFeeSell: n(form.providerFeeSell),
      networkFee: n(form.networkFee),
      customerFeeFixed: n(form.customerFeeFixed),
      customerFeePercent: n(form.customerFeePercent),
    });
  }, [form]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createOperation(
      {
        module: 'cripto',
        header: {
          client_id: form.clientId || null,
          provider_id: form.providerId || null,
          reference: form.reference || null,
          observations: form.observations || null,
          status: 'completada',
        },
        details: {
          cryptoAssetCode: assetCode,
          cryptoNetworkId: form.networkId,
          txHash: form.txHash || null,
          walletOriginAddress: form.walletOrigin || null,
          walletDestinationAddress: form.walletDestination || null,
          quantity: Number(form.quantity),
          marketPrice: Number(form.marketPrice || form.buyPrice),
          buyPrice: Number(form.buyPrice),
          sellPrice: Number(form.sellPrice),
          providerFeeBuy: Number(form.providerFeeBuy),
          providerFeeSell: Number(form.providerFeeSell),
          networkFee: Number(form.networkFee),
          customerFeeFixed: Number(form.customerFeeFixed),
          customerFeePercent: Number(form.customerFeePercent),
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
          <label>Proveedor / exchange</label>
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
          <label>Activo</label>
          <select
            required
            value={assetCode}
            onChange={(e) => {
              setAssetCode(e.target.value);
              setForm((f) => ({ ...f, networkId: '' }));
            }}
          >
            <option value="">Selecciona…</option>
            {assets?.map((a: any) => (
              <option key={a.code} value={a.code}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Red / blockchain</label>
          <select required value={form.networkId} onChange={set('networkId')} disabled={!assetCode}>
            <option value="">Selecciona…</option>
            {networks?.map((n: any) => (
              <option key={n.id} value={n.id}>
                {n.network_name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Cantidad</label>
          <input required type="number" step="any" value={form.quantity} onChange={set('quantity')} />
        </div>
        <div className="field">
          <label>Precio de mercado (referencia)</label>
          <input type="number" step="any" placeholder="= precio de compra si se deja vacío" value={form.marketPrice} onChange={set('marketPrice')} />
        </div>
        <div className="field">
          <label>Precio de compra (costo real EA)</label>
          <input required type="number" step="any" value={form.buyPrice} onChange={set('buyPrice')} />
        </div>
        <div className="field">
          <label>Precio de venta (cobrado al cliente)</label>
          <input required type="number" step="any" value={form.sellPrice} onChange={set('sellPrice')} />
        </div>

        <div className="field">
          <label>Comisión exchange — compra</label>
          <input type="number" step="any" value={form.providerFeeBuy} onChange={set('providerFeeBuy')} />
        </div>
        <div className="field">
          <label>Comisión exchange — venta</label>
          <input type="number" step="any" value={form.providerFeeSell} onChange={set('providerFeeSell')} />
        </div>
        <div className="field">
          <label>Comisión de red (gas)</label>
          <input type="number" step="any" value={form.networkFee} onChange={set('networkFee')} />
        </div>
        <div className="field">
          <label>Comisión cliente — fija</label>
          <input type="number" step="any" value={form.customerFeeFixed} onChange={set('customerFeeFixed')} />
        </div>

        <div className="field">
          <label>TX Hash</label>
          <input value={form.txHash} onChange={set('txHash')} placeholder="opcional" />
        </div>
        <div className="field">
          <label>Referencia</label>
          <input value={form.reference} onChange={set('reference')} />
        </div>
        <div className="field">
          <label>Wallet origen</label>
          <input value={form.walletOrigin} onChange={set('walletOrigin')} placeholder="opcional" />
        </div>
        <div className="field">
          <label>Wallet destino</label>
          <input value={form.walletDestination} onChange={set('walletDestination')} placeholder="opcional" />
        </div>
      </div>

      <div className="field">
        <label>Observaciones</label>
        <textarea rows={2} value={form.observations} onChange={set('observations')} />
      </div>

      {preview && (
        <div className="card card-tight" style={{ background: 'var(--navy-850)', marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Cálculo automático
          </div>
          <PreviewRow label="Costo de adquisición" value={fmtMoney(toDisplayNumber(preview.acquisitionCost))} />
          <PreviewRow label="Ingreso total" value={fmtMoney(toDisplayNumber(preview.totalRevenue))} />
          <PreviewRow label="Spread total" value={fmtMoney(toDisplayNumber(preview.totalSpread))} />
          <PreviewRow label="Utilidad neta" value={fmtMoney(toDisplayNumber(preview.netProfit))} tone={toDisplayNumber(preview.netProfit) >= 0 ? 'pos' : 'neg'} bold />
          <PreviewRow label="Margen" value={fmtPercent(toDisplayNumber(preview.marginPercent))} />
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
