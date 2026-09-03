import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { KpiCard } from '../components/ui/KpiCard';
import { useDashboardTotals, useExchangeRates, useModuleTotals, useOperatorTotals } from '../lib/api/hooks';
import { fmtMoney, fmtMoneyCompact, fmtNumber, fmtPercent, parseLocalDate, toLocalDateString } from '../lib/format';

const PERIODS = [
  { days: 7, label: '7 días' },
  { days: 30, label: '30 días' },
  { days: 90, label: '90 días' },
] as const;

const REFRESH_MS = 60_000;

/** Inicio de la ventana "semana": los últimos 7 días (hoy incluido).
 *  Antes era "desde el lunes", que en lunes daba lo mismo que "Hoy". */
function startOfWeek(d: Date) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 6);
  return r;
}

export function DashboardPage() {
  const qc = useQueryClient();
  const { data: daily, isLoading: loadingDaily } = useDashboardTotals();
  const { data: moduleTotals, isLoading: loadingModules } = useModuleTotals();
  const { data: operatorTotals } = useOperatorTotals();
  const { data: rates } = useExchangeRates();

  // Auto-refresco: el tablero vive en una pantalla, nadie va a recargar.
  useEffect(() => {
    const id = setInterval(() => {
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['exchange_rates'] });
      qc.invalidateQueries({ queryKey: ['operations'] });
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [qc]);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    // Fuerza recalcular los rangos de fecha una vez por minuto para que
    // "hoy / semana / mes" no se queden pegados si la pantalla lleva días
    // encendida.
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Todo en string "YYYY-MM-DD" en hora LOCAL — nunca Date directo, para no
  // caer en el desfase de un día que da comparar contra UTC (ver parseLocalDate).
  const ranges = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return {
      today: toLocalDateString(now),
      // límite superior: mañana. Nada con fecha futura debe contar en
      // "hoy / semana / mes / año" (p. ej. una fila con la fecha mal capturada).
      tomorrow: toLocalDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)),
      weekStart: toLocalDateString(startOfWeek(now)),
      monthStart: toLocalDateString(monthStart),
      prevMonthStart: toLocalDateString(prevMonthStart),
      yearStart: toLocalDateString(new Date(now.getFullYear(), 0, 1)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const totals = useMemo(() => {
    const rows = daily ?? [];
    const sum = (from: string, to?: string) =>
      rows
        .filter((r) => r.operation_date >= from && (to === undefined || r.operation_date < to))
        .reduce(
          (acc, r) => ({
            operations: acc.operations + Number(r.operations_count),
            revenue: acc.revenue + Number(r.gross_revenue),
            costs: acc.costs + Number(r.total_costs),
            profit: acc.profit + Number(r.net_profit),
          }),
          { operations: 0, revenue: 0, costs: 0, profit: 0 }
        );

    return {
      today: sum(ranges.today, ranges.tomorrow), // solo el día de hoy
      week: sum(ranges.weekStart, ranges.tomorrow),
      month: sum(ranges.monthStart, ranges.tomorrow),
      prevMonth: sum(ranges.prevMonthStart, ranges.monthStart),
      year: sum(ranges.yearStart, ranges.tomorrow),
    };
  }, [daily, ranges]);

  // Al arrancar un mes nuevo (p. ej. el día 1) el mes calendario todavía no
  // tiene operaciones: comparar 0 contra el mes anterior daría un "−100 %"
  // engañoso — no es una caída, es que aún no entra nada. En ese caso no hay
  // delta que mostrar.
  const monthDelta =
    totals.month.operations === 0 || totals.prevMonth.profit === 0
      ? null
      : ((totals.month.profit - totals.prevMonth.profit) / Math.abs(totals.prevMonth.profit)) * 100;

  const moduleCards = useMemo(() => {
    // Solo el mes en curso — igual ventana que la tarjeta "Utilidad del mes"
    // (la sección se titula "Por módulo · este mes").
    const rows = (moduleTotals ?? []).filter(
      (r) => r.operation_date >= ranges.monthStart && r.operation_date < ranges.tomorrow,
    );
    const byModule = (m: string) =>
      rows
        .filter((r) => r.module === m)
        .reduce(
          (acc, r) => ({
            operations: acc.operations + Number(r.operations_count),
            revenue: acc.revenue + Number(r.gross_revenue),
            profit: acc.profit + Number(r.net_profit),
            marginSum: acc.marginSum + Number(r.avg_margin_percent) * Number(r.operations_count),
          }),
          { operations: 0, revenue: 0, profit: 0, marginSum: 0 }
        );
    const build = (m: string) => {
      const t = byModule(m);
      return { ...t, avgMargin: t.operations ? t.marginSum / t.operations : 0 };
    };
    return { transferencia: build('transferencia'), cripto: build('cripto'), efectivo: build('efectivo') };
  }, [moduleTotals, ranges]);

  const maxModuleProfit = Math.max(
    1,
    moduleCards.transferencia.profit,
    moduleCards.cripto.profit,
    moduleCards.efectivo.profit
  );

  const leaderboard = useMemo(() => {
    const rows = (operatorTotals ?? []).filter((r) => r.operation_date >= ranges.monthStart);
    const acc = new Map<string, { name: string; profit: number; operations: number }>();
    for (const r of rows) {
      const key = r.operator_name ?? '—';
      const cur = acc.get(key) ?? { name: key, profit: 0, operations: 0 };
      cur.profit += Number(r.net_profit);
      cur.operations += Number(r.operations_count);
      acc.set(key, cur);
    }
    return [...acc.values()].sort((a, b) => b.profit - a.profit).slice(0, 5);
  }, [operatorTotals, ranges.monthStart]);

  const [periodDays, setPeriodDays] = useState<number>(30);

  const chartData = useMemo(() => {
    const rows = [...(daily ?? [])].reverse().slice(-periodDays);
    return rows.map((r) => ({
      date: parseLocalDate(r.operation_date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }),
      fullDate: parseLocalDate(r.operation_date).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }),
      ingresos: Number(r.gross_revenue),
      costos: Number(r.total_costs),
      utilidad: Number(r.net_profit),
    }));
  }, [daily, periodDays]);

  const chartStats = useMemo(() => {
    if (chartData.length === 0) return { revenue: 0, costs: 0, profit: 0 };
    return chartData.reduce(
      (acc, r) => ({ revenue: acc.revenue + r.ingresos, costs: acc.costs + r.costos, profit: acc.profit + r.utilidad }),
      { revenue: 0, costs: 0, profit: 0 }
    );
  }, [chartData]);

  const loading = loadingDaily || loadingModules;
  const activeRates = (rates ?? []).slice(0, 6);

  return (
    <div>
      <div className="dash-header">
        <div>
          <div className="dash-title">
            EA DIVISAS <span>· Operaciones</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12.5, color: 'var(--text-mute)' }}>
            <span className="live-dot" /> En vivo · se actualiza cada minuto
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <LiveClock />
          <FullscreenButton />
        </div>
      </div>

      <div className="dash-hero-grid">
        <div className="hero-card accent-green">
          <div className="hero-label">Utilidad del mes</div>
          <div className={`hero-value ${totals.month.profit >= 0 ? 'pos' : 'neg'}`}>{fmtMoney(totals.month.profit)}</div>
          <div className="hero-sub" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {monthDelta === null ? (
              <span className="delta-chip flat">
                {totals.month.operations === 0 ? '— sin operaciones este mes aún' : '— sin mes previo'}
              </span>
            ) : (
              <span className={`delta-chip ${monthDelta > 0.5 ? 'up' : monthDelta < -0.5 ? 'down' : 'flat'}`}>
                {monthDelta > 0 ? '▲' : monthDelta < 0 ? '▼' : '='} {fmtNumber(Math.abs(monthDelta), 1)}% vs mes anterior
              </span>
            )}
            <span>{fmtNumber(totals.month.operations, 0)} operaciones este mes</span>
          </div>
        </div>

        <div className="hero-card">
          <div className="hero-label">Hoy</div>
          <div className={`hero-value sm ${totals.today.profit >= 0 ? 'pos' : 'neg'}`}>{fmtMoney(totals.today.profit)}</div>
          <div className="hero-sub">{fmtNumber(totals.today.operations, 0)} operaciones</div>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: 18 }}>
        <KpiCard label="Utilidad 7 días" value={fmtMoney(totals.week.profit)} tone={totals.week.profit >= 0 ? 'pos' : 'neg'} />
        <KpiCard label="Utilidad año" value={fmtMoney(totals.year.profit)} tone={totals.year.profit >= 0 ? 'pos' : 'neg'} />
        <KpiCard label="Operaciones (mes)" value={fmtNumber(totals.month.operations, 0)} />
        <KpiCard
          label="Utilidad prom. / operación"
          value={totals.month.operations ? fmtMoney(totals.month.profit / totals.month.operations) : '—'}
        />
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 14 }}>
          <div style={{ display: 'flex', gap: 30, flexWrap: 'wrap' }}>
            <ChartStat dot="var(--chart-profit)" label="Utilidad del periodo" value={fmtMoney(chartStats.profit)} tone={chartStats.profit >= 0 ? 'pos' : 'neg'} />
          </div>
          <div style={{ display: 'flex', gap: 4, background: 'var(--navy-850)', border: '1px solid var(--border)', borderRadius: 8, padding: 3 }}>
            {PERIODS.map((p) => (
              <button
                key={p.days}
                onClick={() => setPeriodDays(p.days)}
                style={{
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 14px',
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: periodDays === p.days ? '#fff' : 'var(--text-dim)',
                  background: periodDays === p.days ? 'var(--electric)' : 'transparent',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="gRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-revenue)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--chart-revenue)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-profit)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--chart-profit)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <ReferenceLine y={0} stroke="var(--border-strong)" strokeWidth={1} />
              <XAxis
                dataKey="date"
                stroke="var(--text-mute)"
                fontSize={11.5}
                tickLine={false}
                axisLine={false}
                interval={periodDays > 30 ? Math.ceil(periodDays / 12) : 'preserveStartEnd'}
                minTickGap={24}
              />
              <YAxis stroke="var(--text-mute)" fontSize={11.5} tickLine={false} axisLine={false} width={58} tickFormatter={(v) => fmtMoneyCompact(v)} />
              <Tooltip cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1, strokeDasharray: '3 3' }} content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="utilidad"
                name="Utilidad"
                stroke="var(--chart-profit)"
                strokeWidth={2.75}
                fill="url(#gProfit)"
                activeDot={{ r: 6, fill: 'var(--chart-profit)', stroke: 'var(--navy-900)', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div style={{ display: 'flex', gap: 20, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <LegendKey color="var(--chart-revenue)" label="Ingresos" />
          <LegendKey color="var(--chart-cost)" label="Costos" dashed />
          <LegendKey color="var(--chart-profit)" label="Utilidad" />
        </div>
      </div>

      <div className="dash-split">
        <div>
          <SectionTitle>Por módulo · este mes</SectionTitle>
          <div className="grid-3">
            <ModuleCard
              title="Transferencias"
              data={moduleCards.transferencia}
              extraLabel="Comisión promedio"
              extraValue={fmtPercent(moduleCards.transferencia.avgMargin)}
              barMax={maxModuleProfit}
            />
            <ModuleCard
              title="Cripto"
              data={moduleCards.cripto}
              extraLabel="Margen promedio"
              extraValue={fmtPercent(moduleCards.cripto.avgMargin)}
              barMax={maxModuleProfit}
            />
            <ModuleCard
              title="Efectivo"
              data={moduleCards.efectivo}
              extraLabel="Margen promedio"
              extraValue={fmtPercent(moduleCards.efectivo.avgMargin)}
              barMax={maxModuleProfit}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gap: 18 }}>
          <div className="card">
            <SectionTitle>Tipos de cambio</SectionTitle>
            {activeRates.length === 0 && <div style={{ color: 'var(--text-mute)', fontSize: 13 }}>Sin tipos de cambio cargados.</div>}
            {activeRates.map((r: any) => (
              <div key={r.id} className="rate-row">
                <span className="rate-pair">{r.pair}</span>
                <span className="rate-nums">
                  <s>C {fmtNumber(r.buy_rate, 4)}</s> &nbsp; <b>V {fmtNumber(r.sell_rate, 4)}</b>
                </span>
              </div>
            ))}
          </div>

          <div className="card">
            <SectionTitle>Top operadores · mes</SectionTitle>
            {leaderboard.length === 0 && <div style={{ color: 'var(--text-mute)', fontSize: 13 }}>Sin operaciones este mes.</div>}
            {leaderboard.map((o, i) => (
              <div key={o.name} className="lead-row">
                <span className="lead-rank">{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13.5, fontWeight: 500 }}>
                  {o.name}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-mute)' }}>{fmtNumber(o.operations, 0)} ops</span>
                <span className={`mono ${o.profit >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: 13, fontWeight: 700, minWidth: 92, textAlign: 'right' }}>
                  {fmtMoney(o.profit)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {loading && <div style={{ color: 'var(--text-mute)', marginTop: 12 }}>Cargando…</div>}
    </div>
  );
}

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const hora = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const fecha = now.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <div className="dash-clock" style={{ textAlign: 'right' }}>
      {hora}
      <br />
      <small>{fecha.charAt(0).toUpperCase() + fecha.slice(1)}</small>
    </div>
  );
}

function FullscreenButton() {
  const [fs, setFs] = useState(false);
  useEffect(() => {
    const onChange = () => setFs(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  function toggle() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }
  return (
    <button className="dash-fullscreen-btn" onClick={toggle} title="Modo pantalla">
      {fs ? '✕ Salir' : '⛶ Pantalla'}
    </button>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 12px' }}>
      {children}
    </div>
  );
}

function ModuleCard({
  title,
  data,
  extraLabel,
  extraValue,
  barMax,
}: {
  title: string;
  data: { operations: number; revenue: number; profit: number };
  extraLabel: string;
  extraValue: string;
  barMax: number;
}) {
  const pct = Math.max(0, Math.min(100, (data.profit / barMax) * 100));
  return (
    <div className="card">
      <h3 style={{ fontSize: 15, marginBottom: 14 }}>{title}</h3>
      <div className={`util-bar ${data.profit < 0 ? 'neg' : ''}`} style={{ marginBottom: 14 }}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <Row label="Operaciones" value={fmtNumber(data.operations, 0)} />
      <Row label="Volumen" value={fmtMoney(data.revenue)} />
      <Row label="Utilidad" value={fmtMoney(data.profit)} tone={data.profit >= 0 ? 'pos' : 'neg'} />
      <Row label={extraLabel} value={extraValue} />
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13.5 }}>
      <span style={{ color: 'var(--text-dim)' }}>{label}</span>
      <span className={`mono ${tone === 'pos' ? 'pos' : tone === 'neg' ? 'neg' : ''}`}>{value}</span>
    </div>
  );
}

interface ChartTooltipPayload {
  color: string;
  name: string;
  value: number;
  payload: { fullDate: string };
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: ChartTooltipPayload[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: 'var(--navy-850)',
        border: '1px solid var(--border-strong)',
        borderRadius: 8,
        padding: '10px 12px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        minWidth: 160,
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 8, textTransform: 'capitalize' }}>{payload[0].payload.fullDate}</div>
      {payload.map((entry) => (
        <div key={entry.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '2px 0' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--text-dim)' }}>
            <span style={{ width: 10, height: 2, background: entry.color, display: 'inline-block', borderRadius: 1 }} />
            {entry.name}
          </span>
          <span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>
            {fmtMoney(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function ChartStat({ dot, label, value, tone }: { dot: string; label: string; value: string; tone?: 'pos' | 'neg' }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-dim)', marginBottom: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, display: 'inline-block' }} />
        {label}
      </div>
      <div className={`mono ${tone === 'pos' ? 'pos' : tone === 'neg' ? 'neg' : ''}`} style={{ fontSize: 20, fontWeight: 700 }}>
        {value}
      </div>
    </div>
  );
}

function LegendKey({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--text-dim)' }}>
      <span
        style={{
          width: 14,
          height: 0,
          borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}`,
          display: 'inline-block',
        }}
      />
      {label}
    </span>
  );
}
