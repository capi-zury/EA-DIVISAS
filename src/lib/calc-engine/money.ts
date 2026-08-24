/**
 * Aritmética monetaria exacta para todo el motor de cálculo.
 *
 * Nunca usamos `number`/float de JS para dinero: 0.1 + 0.2 !== 0.3 en IEEE-754,
 * y en un sistema financiero eso es un bug de auditoría, no un detalle técnico.
 * Decimal.js hace aritmética decimal exacta (como NUMERIC de Postgres), así que
 * el resultado de un cálculo aquí es idéntico al que se puede reproducir a mano
 * o en una consulta SQL sobre la misma columna NUMERIC.
 */
import Decimal from 'decimal.js';

// Configuración global de Decimal.js: suficiente precisión interna para
// encadenar varias operaciones (multiplicaciones + sumas) sin perder dígitos
// antes del redondeo final explícito.
Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_UP });

export type Money = Decimal;
export type MoneyInput = Decimal | number | string;

/** Convierte cualquier entrada (número, string, Decimal) a Decimal exacto. */
export function money(value: MoneyInput): Money {
  if (value instanceof Decimal) return value;
  if (value === null || value === undefined || value === '') return new Decimal(0);
  return new Decimal(value);
}

export const ZERO = new Decimal(0);

/**
 * Redondeo explícito con regla configurable (nunca implícito).
 * decimals: 2 para MXN/USD en pantallas de resumen, hasta 8 para cantidades cripto.
 */
export function round(value: MoneyInput, decimals: number, rule: Decimal.Rounding = Decimal.ROUND_HALF_UP): Money {
  return money(value).toDecimalPlaces(decimals, rule);
}

/** Redondeo estándar para montos fiat mostrados al usuario (2 decimales, half-up). */
export function roundFiat(value: MoneyInput): Money {
  return round(value, 2);
}

/** Redondeo para cantidades de criptomoneda (8 decimales, suficiente para BTC/ETH/USDT). */
export function roundCrypto(value: MoneyInput): Money {
  return round(value, 8);
}

/** Porcentaje: convierte 0.6 (=0.6%) en el factor 0.006 usado en multiplicaciones. */
export function pctFactor(percent: MoneyInput): Money {
  return money(percent).dividedBy(100);
}

/** Devuelve el número como string decimal fijo, seguro para guardar en NUMERIC de Postgres. */
export function toDbString(value: MoneyInput, decimals = 8): string {
  return round(value, decimals).toFixed(decimals);
}

/** Devuelve un `number` de JS solo para mostrar en UI (charts, inputs) — nunca para volver a calcular con él. */
export function toDisplayNumber(value: MoneyInput): number {
  return money(value).toNumber();
}
