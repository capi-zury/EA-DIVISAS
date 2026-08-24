export function fmtMoney(value: number | string | null | undefined, currency = 'MXN') {
  const n = Number(value ?? 0);
  return n.toLocaleString('es-MX', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtNumber(value: number | string | null | undefined, decimals = 2) {
  const n = Number(value ?? 0);
  return n.toLocaleString('es-MX', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Compacto para ejes de gráfica: $12.3K, $1.2M, -$500. */
export function fmtMoneyCompact(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toLocaleString('es-MX', { maximumFractionDigits: 1 })}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toLocaleString('es-MX', { maximumFractionDigits: 1 })}K`;
  return `${sign}$${abs.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;
}

export function fmtPercent(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return `${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export function fmtDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: '2-digit' });
}

export function fmtDateTime(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-MX', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * `new Date("2026-08-24")` (una fecha SIN hora) se interpreta como
 * medianoche UTC — en México (UTC-6) eso cae en la tarde del día ANTERIOR.
 * Comparar eso contra "hoy" en hora local hace que las operaciones de HOY
 * se vean como si fueran de ayer. `operation_date` de la base es una fecha
 * sola (sin hora) — para trabajar con ella en el navegador siempre hay que
 * pasar por aquí, nunca por `new Date(dateString)` directo.
 */
export function parseLocalDate(dateOnly: string): Date {
  const [year, month, day] = dateOnly.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Fecha local (no UTC) en formato "YYYY-MM-DD", para comparar contra `operation_date`. */
export function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
