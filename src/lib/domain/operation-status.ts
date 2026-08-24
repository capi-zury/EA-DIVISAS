/**
 * Estados de una operación y sus transiciones válidas.
 * Aplica a los 3 módulos (transferencias, cripto, efectivo) por igual —
 * viven en la tabla común `operations`, no una por módulo.
 */
export const OPERATION_STATUSES = [
  'cotizacion',
  'pendiente',
  'en_proceso',
  'enviada',
  'completada',
  'cancelada',
  'reembolsada',
  'con_incidencia',
] as const;

export type OperationStatus = (typeof OPERATION_STATUSES)[number];

export const OPERATION_STATUS_LABELS: Record<OperationStatus, string> = {
  cotizacion: 'Cotización',
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  enviada: 'Enviada',
  completada: 'Completada',
  cancelada: 'Cancelada',
  reembolsada: 'Reembolsada',
  con_incidencia: 'Con incidencia',
};

/** Transiciones permitidas desde cada estado — impide saltos ilógicos (ej. Cotización → Completada). */
export const ALLOWED_TRANSITIONS: Record<OperationStatus, OperationStatus[]> = {
  cotizacion: ['pendiente', 'cancelada'],
  pendiente: ['en_proceso', 'cancelada'],
  en_proceso: ['enviada', 'con_incidencia', 'cancelada'],
  enviada: ['completada', 'con_incidencia'],
  completada: ['reembolsada', 'con_incidencia'],
  cancelada: [],
  reembolsada: [],
  con_incidencia: ['en_proceso', 'completada', 'cancelada'],
};

export function canTransition(from: OperationStatus, to: OperationStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Estados cuya utilidad SÍ debe sumarse en dashboards/reportes.
 * Canceladas y reembolsadas quedan registradas (nunca se borran) pero no
 * cuentan como ganancia real de la empresa.
 */
const PROFIT_COUNTED_STATUSES: ReadonlySet<OperationStatus> = new Set([
  'completada',
  'enviada',
  'en_proceso',
  'con_incidencia',
]);

export function isProfitCounted(status: OperationStatus): boolean {
  return PROFIT_COUNTED_STATUSES.has(status);
}
