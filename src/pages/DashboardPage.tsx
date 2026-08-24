import { useMemo, useState, type ReactNode } from 'react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { PageHeader } from '../components/ui/PageHeader';
import { KpiCard } from '../components/ui/KpiCard';
import { useDashboardTotals, useModuleTotals } from '../lib/api/hooks';
import { fmtMoney, fmtMoneyCompact, fmtNumber, fmtPercent, parseLocalDate, toLocalDateString } from '../lib/format';

const PERIODS = [
  { days: 7, label: '7 días' },
  { days: 30, label: '30 días' },
  { days: 90, label: '90 días' },
] as const;

function startOfWeek(d: Date) {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // lunes como inicio
  const r = new Date(d);
  r.setDate(d.getDate() + diff);
  r.setHours(0, 0, 0, 0);
  return r;
}

export function DashboardPage() {
  const { data: daily, isLoading: loadingDaily } = useDashboardTotals();
  const { data: moduleTotals, isLoading: loadingModules } = useModuleTotals();

  // Todo en string "YYYY-MM-DD" en hora LOCAL — nunca Date directo, para no
  // caer en el desfase de un día que da comparar contra UTC (ver parseLocalDate).
  const ranges = useMemo(() => {
    const now = new Date();
    const today = toLocalDateString(now);
    const weekStart = toLocalDateString(startOfWeek(now));
    const monthStart = toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));
    const yearStart = toLocalDateString(new Date(now.getFullYear(), 0, 1));
    return { today, weekStart, monthStart, yearStart };
  }, []);

  const totals = useMemo(() => {
    const rows = daily ?? [];
    const sum = (from: string) =>
      rows
        .filter((r) => r.operation_date >= from)
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
      today: sum(ranges.today),
      week: sum(ranges.weekStart),
      month: sum(ranges.monthStart),
      year: sum(ranges.yearStart),
    };
  }, [daily, ranges]);

  const moduleCards = useMemo(() => {
    const rows = moduleTotals ?? [];
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
  }, [moduleTotals]);

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

  return (
    <div>
      <PageHeader title="Resumen" subtitle="Resumen operativo de EA Divisas" />

      <SectionTitle>Hoy</SectionTitle>
      <Grid>
        <KpiCard label="Operaciones" value={fmtNumber(totals.today.operations, 0)} />
        <KpiCard label="Ingresos" value={fmtMoney(totals.today.revenue)} />
        <KpiCard label="Costos" value={fmtMoney(totals.today.costs)} />
        <KpiCard label="Utilidad" value={fmtMoney(totals.today.profit)} tone={totals.today.profit >= 0 ? 'pos' : 'neg'} />
      </Grid>

      <SectionTitle>Utilidad</SectionTitle>
      <Grid>
        <KpiCard label="Del día" value={fmtMoney(totals.today.profit)} tone={totals.today.profit >= 0 ? 'pos' : 'neg'} />
        <KpiCard label="De la semana" value={fmtMoney(totals.week.profit)} tone={totals.week.profit >= 0 ? 'pos' : 'neg'} />
        <KpiCard label="Del mes" value={fmtMoney(totals.month.profit)} tone={totals.month.profit >= 0 ? 'pos' : 'neg'} />
        <KpiCard label="Del año" value={fmtMoney(totals.year.profit)} tone={totals.year.profit >= 0 ? 'pos' : 'neg'} />
      </Grid>

      <div className="card" style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 14 }}>
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
            <ChartStat dot="var(--chart-revenue)" label="Ingresos" value={fmtMoney(chartStats.revenue)} />
            <ChartStat dot="var(--chart-cost)" label="Costos" value={fmtMoney(chartStats.costs)} />
            <ChartStat dot="var(--chart-profit)" label="Utilidad" value={fmtMoney(chartStats.profit)} tone={chartStats.profit >= 0 ? 'pos' : 'neg'} />
          </div>
          <div style={{ display: 'flex', gap: 4, background: 'var(--navy-850)', border: '1px solid var(--border)', borderRadius: 8, padding: 3 }}>
            {PERIODS.map((p) => (
              <button
                key={p.days}
                onClick={() => setPeriodDays(p.days)}
                style={{
                  border: 'none',
                  borderRadius: 6,
                  padding: '5px 12px',
                  fontSize: 12,
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

        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <ReferenceLine y={0} stroke="var(--border-strong)" strokeWidth={1} />
              <XAxis
                dataKey="date"
                stroke="var(--text-mute)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                interval={periodDays > 30 ? Math.ceil(periodDays / 12) : 'preserveStartEnd'}
                minTickGap={24}
              />
              <YAxis stroke="var(--text-mute)" fontSize={11} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => fmtMoneyCompact(v)} />
              <Tooltip cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1, strokeDasharray: '3 3' }} content={<ChartTooltip />} />
              <Line
                type="monotone"
                dataKey="ingresos"
                name="Ingresos"
                stroke="var(--chart-revenue)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, fill: 'var(--chart-revenue)', stroke: 'var(--navy-900)', strokeWidth: 2 }}
              />
              <Line
                type="monotone"
                dataKey="costos"
                name="Costos"
                stroke="var(--chart-cost)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, fill: 'var(--chart-cost)', stroke: 'var(--navy-900)', strokeWidth: 2 }}
              />
              <Line
                type="monotone"
                dataKey="utilidad"
                name="Utilidad"
                stroke="var(--chart-profit)"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: 'var(--chart-profit)', stroke: 'var(--navy-900)', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div style={{ display: 'flex', gap: 18, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <LegendKey color="var(--chart-revenue)" label="Ingresos" />
          <LegendKey color="var(--chart-cost)" label="Costos" />
          <LegendKey color="var(--chart-profit)" label="Utilidad" />
        </div>
      </div>

      <SectionTitle>Por módulo</SectionTitle>
      <div className="grid-3" style={{ marginBottom: 8 }}>
        <ModuleCard title="Transferencias" data={moduleCards.transferencia} extraLabel="Comisión promedio" extraValue={fmtPercent(moduleCards.transferencia.avgMargin)} />
        <ModuleCard title="Cripto" data={moduleCards.cripto} extraLabel="Margen promedio" extraValue={fmtPercent(moduleCards.cripto.avgMargin)} />
        <ModuleCard title="Efectivo" data={moduleCards.efectivo} extraLabel="Margen promedio" extraValue={fmtPercent(moduleCards.efectivo.avgMargin)} />
      </div>

      {loading && <div style={{ color: 'var(--text-mute)', marginTop: 12 }}>Cargando…</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '4px 0 12px' }}>
      {children}
    </div>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return (
    <div className="grid-4" style={{ marginBottom: 28 }}>
      {children}
    </div>
  );
}

function ModuleCard({
  title,
  data,
  extraLabel,
  extraValue,
}: {
  title: string;
  data: { operations: number; revenue: number; profit: number };
  extraLabel: string;
  extraValue: string;
}) {
  return (
    <div className="card">
      <h3 style={{ fontSize: 14.5, marginBottom: 14 }}>{title}</h3>
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
      <div className={`mono ${tone === 'pos' ? 'pos' : tone === 'neg' ? 'neg' : ''}`} style={{ fontSize: 19, fontWeight: 700 }}>
        {value}
      </div>
    </div>
  );
}

function LegendKey({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--text-dim)' }}>
      <span style={{ width: 12, height: 2, background: color, display: 'inline-block', borderRadius: 1 }} />
      {label}
    </span>
  );
}
