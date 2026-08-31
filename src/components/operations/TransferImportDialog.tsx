import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useImportOperations, type ImportResponse, type ImportRowResult } from '../../lib/api/hooks';
import {
  IMPORT_FIELDS,
  IMPORT_FIELD_LABELS,
  REQUIRED_IMPORT_FIELDS,
  autoDetectMapping,
  normalizeKey,
  type ColumnMapping,
  type ImportField,
} from '../../lib/import/transfer-import';

const MAPPING_STORAGE_KEY = 'ea-divisas:transfer-import-mapping';
const CHUNK_SIZE = 200;

type Step = 'upload' | 'map' | 'preview' | 'done';
type RawRow = Record<string, unknown>;

function loadSavedMapping(): ColumnMapping {
  try {
    const raw = localStorage.getItem(MAPPING_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ColumnMapping) : {};
  } catch {
    return {};
  }
}

export function TransferImportDialog({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<RawRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [countryOrigin, setCountryOrigin] = useState('México');
  const [countryDestination, setCountryDestination] = useState('Estados Unidos');

  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [finalResults, setFinalResults] = useState<ImportRowResult[]>([]);
  const [runSummary, setRunSummary] = useState<ImportResponse['summary'] | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  const { mutateAsync: runImport, isPending, error } = useImportOperations();

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<RawRow>(ws, { defval: '', raw: false });
      if (!json.length) {
        setParseError('El archivo no tiene filas de datos.');
        return;
      }
      const hdrs = Object.keys(json[0]);
      setFileName(file.name);
      setHeaders(hdrs);
      setRows(json);
      setMapping({ ...autoDetectMapping(hdrs), ...pickValid(loadSavedMapping(), hdrs) });
      setStep('map');
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'No se pudo leer el archivo.');
    }
  }

  const mappedMonto = !!mapping.montoUsd;

  async function goPreview() {
    const res = await runImport({
      source: 'excel',
      fileName,
      mapping: mapping as Record<string, string>,
      rows: rows.slice(0, 1000),
      dryRun: true,
      countryOrigin,
      countryDestination,
    });
    setPreview(res);
    setStep('preview');
  }

  async function runReal() {
    try { localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(mapping)); } catch { /* almacenamiento no disponible */ }
    const all: ImportRowResult[] = [];
    let batchId: string | undefined;
    const totals = { total: 0, created: 0, skipped: 0, errors: 0, ready: 0, newClients: 0 };
    setProgress({ done: 0, total: rows.length });

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const res = await runImport({
        source: 'excel',
        batchId,
        fileName,
        mapping: mapping as Record<string, string>,
        rows: chunk,
        dryRun: false,
        countryOrigin,
        countryDestination,
      });
      batchId = res.batchId ?? batchId;
      all.push(...res.results);
      totals.total += res.summary.total;
      totals.created += res.summary.created;
      totals.skipped += res.summary.skipped;
      totals.errors += res.summary.errors;
      totals.newClients += res.summary.newClients;
      setProgress({ done: Math.min(i + CHUNK_SIZE, rows.length), total: rows.length });
    }

    setFinalResults(all);
    setRunSummary(totals);
    setProgress(null);
    setStep('done');
  }

  function downloadReport() {
    const lines = [
      'fila,estado,folio,cliente,monto_usd,estado_operacion,mensaje',
      ...finalResults.map((r) =>
        [r.row, r.status, r.folio ?? '', csv(r.clientName ?? ''), r.amountUsd ?? '', r.opStatus ?? '', csv(r.message ?? '')].join(','),
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `importacion-transferencias-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <Stepper step={step} />

      {step === 'upload' && (
        <div>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 14 }}>
            Sube un archivo <strong>Excel (.xlsx)</strong> o <strong>CSV</strong> con tus transferencias. La primera fila debe ser
            el encabezado de columnas. El sistema solo lee el archivo — no lo modifica.
          </p>
          <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: 'none' }} />
          <button className="btn btn-primary" onClick={() => fileInput.current?.click()}>
            Elegir archivo…
          </button>
          {parseError && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 12 }}>{parseError}</div>}
        </div>
      )}

      {step === 'map' && (
        <div>
          <div style={{ fontSize: 12.5, color: 'var(--text-mute)', marginBottom: 12 }}>
            <strong>{fileName}</strong> · {rows.length} fila{rows.length === 1 ? '' : 's'} · {headers.length} columnas
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 12 }}>
            Indica qué columna de tu archivo corresponde a cada campo. Lo que se detectó automáticamente ya está puesto.
          </p>

          <div className="grid-2" style={{ gap: '8px 16px' }}>
            {IMPORT_FIELDS.map((field) => (
              <div className="field" key={field}>
                <label>
                  {IMPORT_FIELD_LABELS[field]}
                  {REQUIRED_IMPORT_FIELDS.includes(field) && <span style={{ color: 'var(--red)' }}> *</span>}
                </label>
                <select
                  value={mapping[field] ?? ''}
                  onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value || undefined }))}
                >
                  <option value="">— no mapear —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="grid-2" style={{ gap: '8px 16px', marginTop: 8 }}>
            <div className="field">
              <label>País origen (para todas las filas)</label>
              <input value={countryOrigin} onChange={(e) => setCountryOrigin(e.target.value)} />
            </div>
            <div className="field">
              <label>País destino (para todas las filas)</label>
              <input value={countryDestination} onChange={(e) => setCountryDestination(e.target.value)} />
            </div>
          </div>

          <Callout>
            Las filas se registran con el <strong>principal en USD</strong> y <strong>sin margen</strong> (tu tabla trae un solo
            tipo de cambio). El TC y el equivalente en pesos quedan como referencia en cada operación.
          </Callout>

          {!mappedMonto && (
            <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 10 }}>
              Falta mapear <strong>Monto USD</strong> — es obligatorio.
            </div>
          )}
          {error && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 10 }}>{(error as Error).message}</div>}

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={() => setStep('upload')}>
              Atrás
            </button>
            <button className="btn btn-primary" onClick={goPreview} disabled={!mappedMonto || isPending}>
              {isPending ? 'Revisando…' : 'Ver vista previa'}
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && preview && (
        <div>
          <div className="grid-2" style={{ gap: 10, marginBottom: 14 }}>
            <Tile label="Listas para importar" value={preview.summary.ready} tone="pos" />
            <Tile label="Ya importadas (se omiten)" value={preview.summary.skipped} />
            <Tile label="Con error" value={preview.summary.errors} tone={preview.summary.errors ? 'neg' : undefined} />
            <Tile label="Clientes nuevos a crear" value={preview.summary.newClients} />
          </div>
          {rows.length > 1000 && (
            <div style={{ fontSize: 12, color: 'var(--text-mute)', marginBottom: 10 }}>
              Vista previa de las primeras 1000 filas. Al importar se procesan las {rows.length}.
            </div>
          )}

          <ResultTable results={preview.results} limit={200} />

          {error && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 10 }}>{(error as Error).message}</div>}

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={() => setStep('map')}>
              Atrás
            </button>
            <button className="btn btn-primary" onClick={runReal} disabled={isPending || preview.summary.ready === 0}>
              {progress
                ? `Importando ${progress.done}/${progress.total}…`
                : `Importar ${preview.summary.ready} operación${preview.summary.ready === 1 ? '' : 'es'}`}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && runSummary && (
        <div>
          <div className="grid-2" style={{ gap: 10, marginBottom: 14 }}>
            <Tile label="Creadas" value={runSummary.created} tone="pos" />
            <Tile label="Omitidas (ya existían)" value={runSummary.skipped} />
            <Tile label="Con error" value={runSummary.errors} tone={runSummary.errors ? 'neg' : undefined} />
            <Tile label="Clientes creados" value={runSummary.newClients} />
          </div>

          <ResultTable results={finalResults} limit={300} />

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={downloadReport}>
              Descargar reporte (CSV)
            </button>
            <button className="btn btn-primary" onClick={onClose}>
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function pickValid(mapping: ColumnMapping, headers: string[]): ColumnMapping {
  const set = new Set(headers.map(normalizeKey));
  const out: ColumnMapping = {};
  for (const [field, col] of Object.entries(mapping)) {
    if (col && set.has(normalizeKey(col))) {
      const real = headers.find((h) => normalizeKey(h) === normalizeKey(col));
      if (real) out[field as ImportField] = real;
    }
  }
  return out;
}

function csv(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function Stepper({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'upload', label: '1. Archivo' },
    { key: 'map', label: '2. Columnas' },
    { key: 'preview', label: '3. Vista previa' },
    { key: 'done', label: '4. Resultado' },
  ];
  const activeIdx = steps.findIndex((s) => s.key === step);
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
      {steps.map((s, i) => (
        <span
          key={s.key}
          style={{
            fontSize: 11.5,
            padding: '4px 9px',
            borderRadius: 6,
            background: i === activeIdx ? 'var(--electric)' : 'var(--navy-850)',
            color: i === activeIdx ? '#fff' : i < activeIdx ? 'var(--text-dim)' : 'var(--text-mute)',
          }}
        >
          {s.label}
        </span>
      ))}
    </div>
  );
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12.5,
        color: 'var(--text-dim)',
        background: 'var(--navy-850)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '10px 12px',
        marginTop: 12,
      }}
    >
      {children}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: 'pos' | 'neg' }) {
  return (
    <div className="card card-tight" style={{ background: 'var(--navy-850)' }}>
      <div style={{ fontSize: 11, color: 'var(--text-mute)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div className={`mono ${tone ?? ''}`} style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

function ResultTable({ results, limit }: { results: ImportRowResult[]; limit: number }) {
  const shown = useMemo(() => results.slice(0, limit), [results, limit]);
  const badge: Record<ImportRowResult['status'], string> = {
    created: 'Creada',
    ready: 'Lista',
    skipped: 'Omitida',
    error: 'Error',
  };
  return (
    <div style={{ overflowX: 'auto', maxHeight: 340, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
      <table style={{ fontSize: 12.5 }}>
        <thead>
          <tr>
            <th style={{ width: 48 }}>Fila</th>
            <th>Estado</th>
            <th>Folio</th>
            <th>Cliente</th>
            <th className="num">Monto USD</th>
            <th>Nota</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.row} style={r.status === 'error' ? { background: 'rgba(220,60,60,0.08)' } : undefined}>
              <td className="mono">{r.row}</td>
              <td>
                <span className={r.status === 'error' ? 'neg' : r.status === 'skipped' ? '' : 'pos'}>{badge[r.status]}</span>
              </td>
              <td className="mono">{r.folio ?? '—'}</td>
              <td>
                {r.clientName ?? '—'}
                {r.willCreateClient && (
                  <span style={{ fontSize: 10.5, color: 'var(--electric-bright)', marginLeft: 6 }}>nuevo</span>
                )}
              </td>
              <td className="num mono">{r.amountUsd != null ? r.amountUsd.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}</td>
              <td style={{ color: 'var(--text-mute)' }}>{r.message ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {results.length > limit && (
        <div style={{ fontSize: 11.5, color: 'var(--text-mute)', padding: '6px 10px' }}>
          … y {results.length - limit} filas más (descarga el reporte para verlas todas).
        </div>
      )}
    </div>
  );
}
