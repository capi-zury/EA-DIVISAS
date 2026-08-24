export function fmtMoney(value: number | string | null | undefined, currency = 'MXN') {
  const n = Number(value ?? 0);
  return n.toLocaleString('es-MX', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtNumber(value: number | string | null | undefined, decimals = 2) {
  const n = Number(value ?? 0);
  return n.toLocaleString('es-MX', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
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
