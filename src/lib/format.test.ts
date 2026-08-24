import { describe, expect, it } from 'vitest';
import { parseLocalDate, toLocalDateString } from './format';

describe('fechas locales (bug real: comparar operation_date con `new Date()` desfasa un día en zonas UTC-negativas como México)', () => {
  it('toLocalDateString + comparación de strings incluye la operación de HOY en el rango de HOY', () => {
    const today = new Date(2026, 7, 24); // 24 de agosto, hora LOCAL — sin importar el timezone del runner
    const todayStr = toLocalDateString(today);
    const operationDateFromDb = '2026-08-24'; // lo que devuelve Postgres para una operación de hoy

    // Esta es la comparación real que usa el Resumen — debe ser true.
    expect(operationDateFromDb >= todayStr).toBe(true);

    // La comparación vieja y rota (para dejar constancia de qué se rompía):
    // new Date('2026-08-24') se interpreta como medianoche UTC, que en una
    // zona UTC-negativa cae en la tarde del día anterior — por eso fallaba.
  });

  it('parseLocalDate no desfasa la fecha al mostrarla (mismo año/mes/día que el string original)', () => {
    const d = parseLocalDate('2026-08-24');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7); // agosto = índice 7
    expect(d.getDate()).toBe(24);
  });

  it('toLocalDateString es la inversa de parseLocalDate', () => {
    const original = '2026-01-05';
    expect(toLocalDateString(parseLocalDate(original))).toBe(original);
  });
});
