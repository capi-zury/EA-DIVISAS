import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Modal } from '../../components/ui/Modal';
import { Hint } from '../../components/ui/Hint';
import { AttachmentsSection } from '../../components/ui/AttachmentsSection';
import {
  useClients,
  useCreateOperation,
  useCryptoAssets,
  useCryptoNetworks,
  useOperations,
  useProviders,
  useUpdateCryptoOperation,
  useUpdateOperationStatus,
} from '../../lib/api/hooks';
import { useAuth } from '../../lib/auth/AuthContext';
import { fmtDate, fmtMoney, fmtNumber, fmtPercent } from '../../lib/format';
import { calcCrypto, toDisplayNumber } from '../../lib/calc-engine';
import { OPERATION_STATUS_LABELS, ALLOWED_TRANSITIONS, type OperationStatus } from '../../lib/domain/operation-status';

export function CryptoModulePage() {
  const { data: operations, isLoading } = useOperations('cripto');
  const [showForm, setShowForm] = useState(false);
  const [detailOp, setDetailOp] = useState<any | null>(null);

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
              <OperationRow key={op.id} op={op} onOpenDetail={() => setDetailOp(op)} />
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Nueva operación — Cripto" width={640}>
        <CryptoForm onDone={() => setShowForm(false)} />
      </Modal>

      <Modal open={!!detailOp} onClose={() => setDetailOp(null)} title={`Operación ${detailOp?.folio ?? ''}`} width={640}>
        {detailOp && <CryptoForm editOp={detailOp} onDone={() => setDetailOp(null)} />}
      </Modal>
    </div>
  );
}

function OperationRow({ op, onOpenDetail }: { op: any; onOpenDetail: () => void }) {
  const detail = op.crypto_transactions;
  const { mutate: updateStatus, isPending } = useUpdateOperationStatus();
  const nextStates = ALLOWED_TRANSITIONS[op.status as OperationStatus] ?? [];

  return (
    <tr>
      <td className="mono">{op.folio}</td>
      <td>{fmtDate(op.operation_date)}</td>
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
      <td>
        <button className="btn-edit-ghost" style={{ background: 'none', border: 'none', color: 'var(--electric-bright)', cursor: 'pointer', fontSize: 12.5 }} onClick={onOpenDetail}>
          Detalle
        </button>
      </td>
    </tr>
  );
}

function CryptoForm({ onDone, editOp }: { onDone: () => void; editOp?: any }) {
  const { profile } = useAuth();
  const canEdit = profile && ['super_admin', 'admin'].includes(profile.role);
  const isEdit = !!editOp;
  const detail = editOp?.crypto_transactions;

  const { data: clients } = useClients();
  const { data: assets } = useCryptoAssets();
  const { data: providers } = useProviders();
  const { mutate: createOperation, isPending: creating, error: createError } = useCreateOperation();
  const { mutate: updateOperation, isPending: updating, error: updateError } = useUpdateCryptoOperation();
  const isPending = creating || updating;
  const error = createError || updateError;

  const [assetCode, setAssetCode] = useState(detail?.crypto_asset_code ?? '');
  const { data: networks } = useCryptoNetworks(assetCode || null);

  const [form, setForm] = useState({
    clientId: editOp?.client_id ?? '',
    providerId: editOp?.provider_id ?? '',
    networkId: detail?.crypto_network_id ?? '',
    quantity: detail?.quantity != null ? String(detail.quantity) : '',
    marketPrice: detail?.market_price != null ? String(detail.market_price) : '',
    buyPrice: detail?.buy_price != null ? String(detail.buy_price) : '',
    sellPrice: detail?.sell_price != null ? String(detail.sell_price) : '',
    providerFeeBuy: detail?.provider_fee_buy != null ? String(detail.provider_fee_buy) : '0',
    providerFeeSell: detail?.provider_fee_sell != null ? String(detail.provider_fee_sell) : '0',
    networkFee: detail?.network_fee != null ? String(detail.network_fee) : '0',
    customerFeeFixed: detail?.customer_fee_fixed != null ? String(detail.customer_fee_fixed) : '0',
    customerFeePercent: detail?.customer_fee_percent != null ? String(detail.customer_fee_percent) : '0',
    txHash: detail?.tx_hash ?? '',
    walletOrigin: detail?.wallet_origin_address ?? '',
    walletDestination: detail?.wallet_destination_address ?? '',
    reference: editOp?.reference ?? '',
    observations: editOp?.observations ?? '',
  });

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const readOnly = isEdit && !canEdit;
  // Lo opcional (comisiones, wallets, notas) arranca escondido en una operación
  // nueva para no abrumar; al editar una ya existente se muestra todo de una.
  const [showExtras, setShowExtras] = useState(isEdit);

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
    if (!preview) return;

    const details = {
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
    };

    if (isEdit) {
      updateOperation(
        {
          operationId: editOp.id,
          header: {
            client_id: form.clientId || null,
            provider_id: form.providerId || null,
            reference: form.reference || null,
            observations: form.observations || null,
            gross_revenue: toDisplayNumber(preview.totalRevenue),
            total_costs: toDisplayNumber(preview.acquisitionCost) + Number(form.providerFeeSell) + Number(form.networkFee),
            gross_profit: toDisplayNumber(preview.grossProfit),
            net_profit: toDisplayNumber(preview.netProfit),
            margin_percent: toDisplayNumber(preview.marginPercent),
          },
          details: {
            crypto_asset_code: details.cryptoAssetCode,
            crypto_network_id: details.cryptoNetworkId,
            tx_hash: details.txHash,
            wallet_origin_address: details.walletOriginAddress,
            wallet_destination_address: details.walletDestinationAddress,
            quantity: details.quantity,
            market_price: details.marketPrice,
            buy_price: details.buyPrice,
            sell_price: details.sellPrice,
            provider_fee_buy: details.providerFeeBuy,
            provider_fee_sell: details.providerFeeSell,
            network_fee: details.networkFee,
            customer_fee_fixed: details.customerFeeFixed,
            customer_fee_percent: details.customerFeePercent,
            customer_fee_amount: toDisplayNumber(preview.customerFeeAmount),
            spread_buy: toDisplayNumber(preview.spreadBuy),
            spread_sell: toDisplayNumber(preview.spreadSell),
            acquisition_cost: toDisplayNumber(preview.acquisitionCost),
            total_revenue: toDisplayNumber(preview.totalRevenue),
          },
        },
        { onSuccess: onDone }
      );
    } else {
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
          details,
        },
        { onSuccess: onDone }
      );
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <fieldset disabled={readOnly} style={{ border: 'none', padding: 0, margin: 0 }}>
      <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 18px', lineHeight: 1.55 }}>
        Anota una compra/venta de cripto en 2 pasos. Llena lo de abajo y el sistema te dice solo
        cuánto ganaste. Comisiones, wallets y notas son opcionales — están escondidas para no estorbar.
      </p>

      <h3 className="form-section-title">Paso 1 · ¿Qué compraste o vendiste?</h3>
      <div className="grid-2">
        <div className="field">
          <label>¿Qué cripto?</label>
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
          <label>¿En qué red?</label>
          <select required value={form.networkId} onChange={set('networkId')} disabled={!assetCode}>
            <option value="">Selecciona…</option>
            {networks?.map((n: any) => (
              <option key={n.id} value={n.id}>
                {n.network_name}
              </option>
            ))}
          </select>
          <Hint>El mismo USDT vive en varias redes (Tron, Ethereum…). Elige la que usaste.</Hint>
        </div>
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
          <Hint>Opcional. Déjalo sin asignar si no aplica.</Hint>
        </div>
      </div>

      <h3 className="form-section-title">Paso 2 · ¿Cuánto y a qué precio?</h3>
      <div className="field">
        <label>¿Cuántas monedas?</label>
        <input required type="number" step="any" placeholder="ej. 10000" value={form.quantity} onChange={set('quantity')} style={{ maxWidth: 260 }} />
        <Hint>La cantidad de cripto, no los pesos.</Hint>
      </div>
      <div className="grid-2">
        <div className="field">
          <label>¿A cómo te salió cada una?</label>
          <input required type="number" step="any" placeholder="pesos por moneda" value={form.buyPrice} onChange={set('buyPrice')} />
          <Hint>Lo que pagó EA Divisas por cada moneda.</Hint>
        </div>
        <div className="field">
          <label>¿A cómo se la diste al cliente?</label>
          <input required type="number" step="any" placeholder="pesos por moneda" value={form.sellPrice} onChange={set('sellPrice')} />
          <Hint>Lo que el cliente pagó por cada moneda.</Hint>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowExtras((v) => !v)}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--electric-bright)',
          cursor: 'pointer',
          fontSize: 13,
          padding: '6px 0',
          marginBottom: showExtras ? 8 : 4,
        }}
      >
        {showExtras ? '− Ocultar comisiones, wallets y notas' : '+ Agregar comisiones, wallets o notas (opcional)'}
      </button>

      <div hidden={!showExtras}>
        <h3 className="form-section-title">Comisiones y costos</h3>
        <div className="grid-2">
          <div className="field">
            <label>¿Con qué plataforma operaste?</label>
            <select value={form.providerId} onChange={set('providerId')}>
              <option value="">— sin asignar —</option>
              {providers?.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Hint>El exchange (Bitso, Binance, etc.).</Hint>
          </div>
          <div className="field">
            <label>Precio de referencia</label>
            <input type="number" step="any" placeholder="se usa el de compra si lo dejas vacío" value={form.marketPrice} onChange={set('marketPrice')} />
            <Hint>El precio de mercado en ese momento, solo para comparar.</Hint>
          </div>
          <div className="field">
            <label>Comisión del exchange al comprar</label>
            <input type="number" step="any" placeholder="0" value={form.providerFeeBuy} onChange={set('providerFeeBuy')} />
          </div>
          <div className="field">
            <label>Comisión del exchange al vender</label>
            <input type="number" step="any" placeholder="0" value={form.providerFeeSell} onChange={set('providerFeeSell')} />
          </div>
          <div className="field">
            <label>Costo de mover la cripto — "gas"</label>
            <input type="number" step="any" placeholder="0" value={form.networkFee} onChange={set('networkFee')} />
          </div>
          <div className="field">
            <label>Comisión extra que le cobraste al cliente</label>
            <input type="number" step="any" placeholder="0" value={form.customerFeeFixed} onChange={set('customerFeeFixed')} />
          </div>
        </div>

        <h3 className="form-section-title">Datos de la transacción</h3>
        <div className="grid-2">
          <div className="field">
            <label>TX Hash</label>
            <input value={form.txHash} onChange={set('txHash')} placeholder="identificador en la blockchain" />
          </div>
          <div className="field">
            <label>Referencia</label>
            <input value={form.reference} onChange={set('reference')} placeholder="folio interno, número de orden, etc." />
          </div>
          <div className="field">
            <label>Wallet de donde salió</label>
            <input value={form.walletOrigin} onChange={set('walletOrigin')} placeholder="dirección de la wallet" />
          </div>
          <div className="field">
            <label>Wallet a donde llegó</label>
            <input value={form.walletDestination} onChange={set('walletDestination')} placeholder="dirección de la wallet" />
          </div>
        </div>

        <div className="field" style={{ marginTop: 4 }}>
          <label>Observaciones</label>
          <textarea rows={2} value={form.observations} onChange={set('observations')} />
        </div>
      </div>

      {preview && (
        <div className="card card-tight" style={{ background: 'var(--navy-850)', margin: '16px 0' }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Cuánto ganas con esta operación (se calcula solo)
          </div>
          <PreviewRow label="Te pagó el cliente" value={fmtMoney(toDisplayNumber(preview.totalRevenue))} />
          <PreviewRow label="Te costó (todo incluido)" value={fmtMoney(toDisplayNumber(preview.totalRevenue) - toDisplayNumber(preview.netProfit))} />
          <PreviewRow
            label="Ganancia"
            value={fmtMoney(toDisplayNumber(preview.netProfit))}
            tone={toDisplayNumber(preview.netProfit) >= 0 ? 'pos' : 'neg'}
            bold
          />
          <div style={{ fontSize: 11.5, color: 'var(--text-mute)', textAlign: 'right', marginTop: 2 }}>
            margen {fmtPercent(toDisplayNumber(preview.marginPercent))}
          </div>
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
