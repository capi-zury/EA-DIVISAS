import { useRef, useState, type ChangeEvent } from 'react';
import { useAttachments, useDeleteAttachment, useUploadAttachment, getAttachmentUrl } from '../../lib/api/hooks';
import { useAuth } from '../../lib/auth/AuthContext';
import { fmtDateTime } from '../../lib/format';

export function AttachmentsSection({ operationId }: { operationId: string }) {
  const { profile } = useAuth();
  const canUpload = profile && ['super_admin', 'admin', 'operador'].includes(profile.role);
  const canDelete = profile?.role === 'super_admin';

  const { data: attachments, isLoading } = useAttachments(operationId);
  const { mutate: upload, isPending: uploading, error: uploadError } = useUploadAttachment();
  const { mutate: remove } = useDeleteAttachment();
  const [openError, setOpenError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    upload({ operationId, file });
    e.target.value = '';
  }

  async function handleOpen(filePath: string) {
    setOpenError(null);
    try {
      const url = await getAttachmentUrl(filePath);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : 'No se pudo abrir el archivo.');
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Comprobantes</div>
        {canUpload && (
          <>
            <input ref={fileInput} type="file" style={{ display: 'none' }} onChange={handleFileChange} accept="image/*,application/pdf" />
            <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => fileInput.current?.click()} disabled={uploading}>
              {uploading ? 'Subiendo…' : '+ Adjuntar'}
            </button>
          </>
        )}
      </div>

      {isLoading && <div style={{ fontSize: 12.5, color: 'var(--text-mute)' }}>Cargando…</div>}
      {!isLoading && (!attachments || attachments.length === 0) && (
        <div style={{ fontSize: 12.5, color: 'var(--text-mute)' }}>Sin comprobantes todavía.</div>
      )}

      {attachments?.map((a: any) => (
        <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => handleOpen(a.file_path)}
            style={{ background: 'none', border: 'none', color: 'var(--electric-bright)', cursor: 'pointer', textAlign: 'left', fontSize: 13, padding: 0 }}
          >
            📎 {a.file_name}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, color: 'var(--text-mute)' }}>{fmtDateTime(a.uploaded_at)}</span>
            {canDelete && (
              <button
                type="button"
                onClick={() => remove({ id: a.id, filePath: a.file_path, operationId })}
                style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 12 }}
              >
                Borrar
              </button>
            )}
          </div>
        </div>
      ))}

      {(uploadError || openError) && (
        <div style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 8 }}>{(uploadError as Error)?.message ?? openError}</div>
      )}
    </div>
  );
}
