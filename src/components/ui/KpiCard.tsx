export function KpiCard({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone?: 'pos' | 'neg' | 'default';
  sub?: string;
}) {
  return (
    <div className="card card-tight">
      <div style={{ fontSize: 11.5, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
        {label}
      </div>
      <div className={`kpi-value ${tone === 'pos' ? 'pos' : tone === 'neg' ? 'neg' : ''}`}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
