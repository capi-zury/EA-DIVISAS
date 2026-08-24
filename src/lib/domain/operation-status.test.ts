import { describe, expect, it } from 'vitest';
import { canTransition, isProfitCounted } from './operation-status';

describe('operation status', () => {
  it('9. una operación cancelada queda registrada pero su utilidad no cuenta en agregados', () => {
    expect(isProfitCounted('cancelada')).toBe(false);
    expect(isProfitCounted('reembolsada')).toBe(false);
    expect(isProfitCounted('completada')).toBe(true);
  });

  it('no permite saltar de Cotización directo a Completada', () => {
    expect(canTransition('cotizacion', 'completada')).toBe(false);
    expect(canTransition('cotizacion', 'pendiente')).toBe(true);
  });

  it('cancelada y reembolsada son estados finales (sin transiciones salientes)', () => {
    expect(canTransition('cancelada', 'pendiente')).toBe(false);
    expect(canTransition('reembolsada', 'completada')).toBe(false);
  });
});
