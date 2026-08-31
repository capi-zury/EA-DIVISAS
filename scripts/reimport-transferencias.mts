#!/usr/bin/env -S npx tsx
/**
 * Re-importa las TRANSFERENCIAS desde el estado de cuenta por cliente
 * ("ESTADOS DE CUENTA CLIENTES"), que es la fuente completa: trae USD,
 * TC venta, TC compra y COM% por operación. Enriquece con datos bancarios
 * del archivo JEEVES (SWIFT, cuenta, banco, dirección, UETR).
 *
 * Modelo:  ganancia = USD*(TC - TC_COMPRA)  +  USD*TC*COM%
 *          (spread cambiario + comisión al cliente; nada más se resta)
 *
 * Uso:
 *   npx tsx scripts/reimport-transferencias.mts <estado.xlsx> <jeeves.xlsx>                 (prueba)
 *   npx tsx scripts/reimport-transferencias.mts <estado.xlsx> <jeeves.xlsx> --apply         (BORRA lo importado y recarga todo)
 *   npx tsx scripts/reimport-transferencias.mts <estado.xlsx> <jeeves.xlsx> --incremental   (NO borra: registra solo los pagos nuevos)
 *
 * --incremental es para las siguientes veces: subes el mismo Excel con
 * filas nuevas y solo se dan de alta las que aún no existen (por su
 * import_key: beneficiario + monto + fecha + cliente).
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { read, utils } from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { calcTransfer, toDisplayNumber } from '../src/lib/calc-engine';
import { detectCountry, normalizeKey, parseAmount, parseDate } from '../src/lib/import/transfer-import';

const [estadoPath, jeevesPath] = process.argv.slice(2);
const INCREMENTAL = process.argv.includes('--incremental');
const APPLY = process.argv.includes('--apply') || INCREMENTAL;
if (!estadoPath || !jeevesPath) {
  console.error('Uso: npx tsx scripts/reimport-transferencias.mts <estado_cuenta.xlsx> <jeeves.xlsx> [--apply]');
  process.exit(1);
}

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  db: { schema: 'divisas' }, auth: { persistSession: false },
});

const benefKey = (s: unknown) =>
  normalizeKey(s)
    .replace(/[.,"'`()]/g, ' ')
    .replace(/\b(CO|LTD|LTDA|LIMITED|INC|LLC|CORP|CORPORATION|INTERNATIONAL|INTL|INDUSTRIAL|IMPORT|EXPORT|IMPT|EXPT|INDUSTRY|TRADE|TRADING|INDUSTRIES|COMPANY|GMBH|SA|SL|SRL|SPA|HK)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const clientFromSheet = (name: string) =>
  name.replace(/^P\s*[\dxX]+\s*[-–]\s*/i, '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/[-–]/g, ' ').replace(/\s+/g, ' ').trim();

// ---------- 1) JEEVES para datos bancarios ----------
type Bank = {
  swift?: string; cuenta?: string; banco?: string; intermediario?: string;
  dirBanco?: string; dirBenef?: string; taxId?: string; uetr?: string;
  flagAlta?: string; flagFactura?: string; flagPago?: string; flagCuenta?: string; promotor?: string;
};
const jeevesBank = new Map<string, Bank>(); // benefKey|usd -> banco
{
  const wb = read(readFileSync(jeevesPath), { cellDates: true });
  const aoa = utils.sheet_to_json<unknown[]>(wb.Sheets['PAGOS'], { header: 1, raw: true, defval: '', blankrows: false });
  const H = (aoa[1] ?? []).map((c) => normalizeKey(c));
  const ci = (n: string) => H.indexOf(n);
  for (let i = 2; i < aoa.length; i++) {
    const r = aoa[i] ?? [];
    const usd = parseAmount(r[ci('MONTO USD')]);
    const nombre = String(r[ci('BENEFICIARIO')] ?? '').trim();
    if (!usd || !nombre) continue;
    jeevesBank.set(`${benefKey(nombre)}|${Math.round(usd * 100)}`, {
      swift: String(r[ci('SWIFT')] ?? '').trim() || undefined,
      cuenta: String(r[ci('CUENTA')] ?? '').trim() || undefined,
      banco: String(r[ci('BANCO')] ?? '').trim() || undefined,
      intermediario: String(r[ci('ROUTING/BANCO INTERMEDIARIO')] ?? '').trim() || undefined,
      dirBanco: String(r[ci('DIRECCION DEL BANCO')] ?? '').trim() || undefined,
      dirBenef: String(r[ci('DIRECCION DE BENEFICIARIO')] ?? '').trim() || undefined,
      taxId: String(r[ci('TAX ID')] ?? '').trim() || undefined,
      uetr: String(r[ci('UETR')] ?? '').trim() || undefined,
      flagAlta: String(r[ci('ALTA')] ?? '').trim() || undefined,
      flagCuenta: String(r[ci('CUENTA CON RECUSROS')] ?? '').trim() || undefined,
      flagFactura: String(r[ci('FACTURA')] ?? '').trim() || undefined,
      flagPago: String(r[ci('PAGO')] ?? '').trim() || undefined,
      promotor: String(r[ci('PROMOTOR')] ?? '').trim() || undefined,
    });
  }
}

// ---------- 2) estado de cuenta: pagos ----------
interface Pago {
  client: string; sheet: string; row: number;
  beneficiary: string; usd: number; tcVenta: number; tcCompra: number; comPct: number;
  date: string | null; factura: string | null; obs: string | null; issues: string[];
}
const pagos: Pago[] = [];
const seen = new Set<string>();
{
  const wb = read(readFileSync(estadoPath), { cellDates: true });
  for (const sheetName of wb.SheetNames) {
    const aoa = utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, raw: true, defval: '', blankrows: false });
    let hdr = -1;
    for (let i = 0; i < Math.min(aoa.length, 8); i++) {
      const k = (aoa[i] ?? []).map((c) => normalizeKey(c));
      if (k.includes('NOMBRE') && k.includes('USD') && k.includes('TC')) { hdr = i; break; }
    }
    if (hdr < 0) continue;
    const H = (aoa[hdr] ?? []).map((c) => normalizeKey(c));
    const ci = (n: string) => H.indexOf(n);
    const client = clientFromSheet(sheetName) || sheetName.trim();

    for (let i = hdr + 1; i < aoa.length; i++) {
      const r = aoa[i] ?? [];
      const usd = parseAmount(r[ci('USD')]);
      const tcVenta = parseAmount(r[ci('TC')]) ?? 0;
      if (!usd || usd <= 0 || tcVenta < 5 || tcVenta > 40) continue; // TC fuera de rango => no es un pago
      const nombre = String(r[ci('NOMBRE')] ?? '').trim();
      if (!nombre || /SALDO INICIAL/i.test(nombre)) continue;
      const concepto = normalizeKey(ci('CONCEPTO') >= 0 ? r[ci('CONCEPTO')] : '');
      if (concepto.includes('DEVOLUC') || concepto.includes('DEPOSITO') || concepto === 'SALDO') continue;

      const date = parseDate(ci('FECHA DE OPERACION') >= 0 ? r[ci('FECHA DE OPERACION')] : null);
      const dedupKey = `${benefKey(nombre)}|${Math.round(usd * 100)}|${date ?? ''}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      let tcCompra = parseAmount(ci('TC COMPRA') >= 0 ? r[ci('TC COMPRA')] : null) ?? 0;
      if (tcCompra < 5 || tcCompra > 40) tcCompra = tcVenta; // sin dato válido => sin spread
      let comPct = parseAmount(ci('COM %') >= 0 ? r[ci('COM %')] : null) ?? 0;
      const issues: string[] = [];
      if (comPct > 0.06 || comPct < 0) { issues.push(`COM% raro (${comPct}) → 0`); comPct = 0; }

      pagos.push({
        client, sheet: sheetName, row: i + 1,
        beneficiary: nombre, usd, tcVenta, tcCompra, comPct, date,
        factura: String(r[ci('FACTURA')] ?? '').trim() || null,
        obs: String(r[ci('OBSERVACIONES')] ?? '').trim() || null,
        issues,
      });
    }
  }
}

// llave natural de cada pago (idempotencia)
const keyOf = (p: Pago) =>
  `h:${normalizeKey(p.beneficiary)}|${Math.round(p.usd * 100)}|${p.date ?? ''}|${normalizeKey(p.client)}`;

// ---------- 3) resumen / prueba ----------
const { data: existingClients } = await db.from('clients').select('id, name');
const clientId = new Map((existingClients ?? []).map((c) => [normalizeKey(c.name), c.id as string]));

// en modo incremental, quitar los pagos que ya están registrados
let yaExisten = 0;
if (INCREMENTAL) {
  // traer TODAS las llaves de transferencias importadas (son pocas) y comparar
  // en memoria — evita el .in() de PostgREST, que se rompe con las comas de
  // los nombres de beneficiario.
  const have = new Set<string>();
  const { data } = await db
    .from('operations')
    .select('import_key')
    .eq('module', 'transferencia')
    .not('import_key', 'is', null);
  for (const r of data ?? []) have.add(r.import_key as string);

  const nuevos = pagos.filter((p) => !have.has(keyOf(p)));
  yaExisten = pagos.length - nuevos.length;
  pagos.length = 0;
  pagos.push(...nuevos);
}

let utilTotal = 0;
let conBanco = 0;
const clientesNuevosSet = new Set<string>();
for (const p of pagos) {
  if (!clientId.has(normalizeKey(p.client))) clientesNuevosSet.add(p.client);
  const calc = calcTransfer({ amountSent: p.usd, buyRate: p.tcCompra, sellRate: p.tcVenta, commissionPercent: p.comPct * 100 });
  utilTotal += toDisplayNumber(calc.netProfit);
  if (jeevesBank.has(`${benefKey(p.beneficiary)}|${Math.round(p.usd * 100)}`)) conBanco++;
}

console.log(`Pagos distintos en el estado de cuenta:   ${pagos.length + yaExisten}`);
if (INCREMENTAL) {
  console.log(`  ya registrados (se omiten):            ${yaExisten}`);
  console.log(`  NUEVOS a registrar:                    ${pagos.length}`);
}
console.log(`  clientes nuevos a crear:                ${clientesNuevosSet.size}`);
console.log(`  con datos bancarios de JEEVES:          ${conBanco}`);
console.log(`  con COM% inválido (se deja en 0):       ${pagos.filter((p) => p.issues.length).length}`);
console.log(`  utilidad total estimada (MXN):          ${utilTotal.toLocaleString('es-MX', { maximumFractionDigits: 2 })}`);
console.log('\nmuestra:');
for (const p of pagos.slice(0, 6)) {
  const calc = calcTransfer({ amountSent: p.usd, buyRate: p.tcCompra, sellRate: p.tcVenta, commissionPercent: p.comPct * 100 });
  console.log(`  ${p.client} → ${p.beneficiary.slice(0, 28)} | ${p.usd} USD | TCv ${p.tcVenta} TCc ${p.tcCompra} COM ${(p.comPct * 100).toFixed(2)}% | util ${toDisplayNumber(calc.netProfit).toLocaleString('es-MX')}`);
}

if (!APPLY) {
  console.log('\n(prueba — --apply borra lo importado y recarga todo · --incremental solo agrega lo nuevo)');
  process.exit(0);
}
if (INCREMENTAL && pagos.length === 0) {
  console.log('\nNada nuevo que registrar.');
  process.exit(0);
}

// ---------- 4) APPLY ----------
console.log(`\n--- ${INCREMENTAL ? 'INCREMENTAL' : 'APPLY (reemplazo total)'} ---`);
const { data: prof } = await db.from('profiles').select('id').eq('role', 'super_admin').limit(1).single();
const createdBy = prof!.id as string;

if (!INCREMENTAL) {
  const { data: toDelete } = await db.from('operations').select('id').eq('module', 'transferencia').not('import_source', 'is', null);
  console.log(`Borrando ${toDelete?.length ?? 0} operaciones importadas anteriores…`);
  for (let i = 0; i < (toDelete ?? []).length; i += 100) {
    const ids = (toDelete ?? []).slice(i, i + 100).map((o) => o.id);
    const { error } = await db.from('operations').delete().in('id', ids);
    if (error) throw error;
  }
}

const { data: batch } = await db
  .from('import_batches')
  .insert({ source: 'excel', file_name: estadoPath.split(/[\\/]/).pop(), triggered_by: createdBy })
  .select('id').single();
const batchId = batch!.id as string;

// refrescar clientes y crear los nuevos
for (const name of clientesNuevosSet) {
  const { data } = await db.from('clients').insert({ name, notes: 'Alta automática por re-importación de transferencias.' }).select('id, name').single();
  if (data) clientId.set(normalizeKey(data.name), data.id as string);
}

let ok = 0, fail = 0;
for (const p of pagos) {
  const calc = calcTransfer({ amountSent: p.usd, buyRate: p.tcCompra, sellRate: p.tcVenta, commissionPercent: p.comPct * 100 });
  const bank = jeevesBank.get(`${benefKey(p.beneficiary)}|${Math.round(p.usd * 100)}`) ?? {};
  const dest = detectCountry(bank.dirBenef, bank.dirBanco, p.beneficiary) ?? 'Estados Unidos';

  const header = {
    client_id: clientId.get(normalizeKey(p.client)) ?? null,
    created_by: createdBy,
    status: 'completada',
    reference: p.factura,
    observations: p.obs,
    operation_date: p.date,
    import_source: 'excel',
    // llave natural: beneficiario + monto + fecha + cliente. Dos filas con
    // todo idéntico son el mismo pago (aparece repetido en las hojas
    // borrador del estado de cuenta) y se colapsan a una.
    import_key: keyOf(p),
    import_batch_id: batchId,
    gross_revenue: toDisplayNumber(calc.grossRevenue),
    total_costs: toDisplayNumber(calc.totalCosts),
    gross_profit: toDisplayNumber(calc.grossProfit),
    net_profit: toDisplayNumber(calc.netProfit),
    margin_percent: toDisplayNumber(calc.marginPercent),
  };
  const details = {
    country_origin: 'México', country_destination: dest,
    currency_origin: 'USD', currency_destination: 'MXN',
    amount_sent: p.usd,
    amount_received: toDisplayNumber(calc.amountReceived),
    exchange_rate_applied: p.tcVenta, buy_rate: p.tcCompra, sell_rate: p.tcVenta,
    commission_fixed: 0, commission_percent: p.comPct * 100,
    commission_amount: toDisplayNumber(calc.commissionAmount),
    provider_cost: 0, bank_cost: 0, additional_cost: 0,
    spread_revenue: toDisplayNumber(calc.spreadRevenue),
    promotor: bank.promotor ?? null,
    beneficiary_name: p.beneficiary,
    beneficiary_account: bank.cuenta ?? null,
    beneficiary_bank: bank.banco ?? null,
    beneficiary_swift: bank.swift ?? null,
    intermediary_bank: bank.intermediario ?? null,
    bank_address: bank.dirBanco ?? null,
    beneficiary_address: bank.dirBenef ?? null,
    beneficiary_tax_id: bank.taxId ?? null,
    uetr: bank.uetr ?? null,
    tc_reference: p.tcVenta,
    amount_mxn: Math.round(p.usd * p.tcVenta * 100) / 100,
    flag_alta: bank.flagAlta ?? null,
    flag_cuenta_con_recursos: bank.flagCuenta ?? null,
    flag_factura: bank.flagFactura ?? null,
    flag_pago: bank.flagPago ?? null,
  };
  const { error } = await db.rpc('create_transfer_operation', { p_header: header, p_details: details });
  if (error) { fail++; if (fail <= 8) console.error(`  ${p.client}/${p.beneficiary.slice(0, 20)}: ${error.message}`); }
  else ok++;
}
console.log(`\ncreadas: ${ok} | con error: ${fail}`);
