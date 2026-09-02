import { useState } from 'react';
import { useDeleteOperation } from '../../lib/api/hooks';

/**
 * Zona de borrado DURO de una operación, para el pie del formulario de
 * edición. Solo se debe renderizar si el usuario puede editar
 * (super_admin/admin) — el RPC igual valida el rol del lado servidor.
 */
export function DeleteOperationButton({
  operationId,
  module,
  onDeleted,
}: {
  operationId: string;
  module: string;
  onDeleted: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const { mutate, isPending, error } = useDeleteOperation(module);

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
      {confirm ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, color: 'var(--red)' }}>
            Se borra de forma permanente (cabecera, detalle, historial y adjuntos). No se puede deshacer.
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ fontSize: 12.5, padding: '4px 10px' }}
            onClick={() => setConfirm(false)}
            disabled={isPending}
          >
            Cancelar
          </button>
          <button
            type="button"
            style={{
              fontSize: 12.5,
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid var(--red)',
              background: 'var(--red-dim)',
              color: 'var(--red)',
              cursor: 'pointer',
            }}
            onClick={() => mutate(operationId, { onSuccess: onDeleted })}
            disabled={isPending}
          >
            {isPending ? 'Borrando…' : 'Sí, borrar'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirm(true)}
          style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 12.5, padding: 0 }}
        >
          Borrar operación
        </button>
      )}
      {error && <div style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 8 }}>{(error as Error).message}</div>}
    </div>
  );
}
