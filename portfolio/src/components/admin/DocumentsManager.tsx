'use client';

import { useEffect, useRef, useState } from 'react';
import { FaCloudUploadAlt, FaFilePdf } from 'react-icons/fa';
import { uploadDocument } from '../../app/admin/document-actions';
import { documentKinds, documentLabels, MAX_DOCUMENT_BYTES, documentFileError, type DocumentKind, type DocumentRecord } from '../../lib/cms/documents';
import SaveNotification, { type SaveNotice } from './SaveNotification';

type Selection = { file: File; url: string; error: string | null };
type Props = { initialDocuments: DocumentRecord[]; setupError: boolean; onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void; onPublished: (document: DocumentRecord) => void };
function sizeLabel(bytes: number) { return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(2)} MB`; }
function updatedLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export default function DocumentsManager({ initialDocuments, setupError, onDirtyChange, onBusyChange, onPublished }: Props) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [selected, setSelected] = useState<Partial<Record<DocumentKind, Selection>>>({});
  const [pending, setPending] = useState<DocumentKind | null>(null);
  const [notice, setNotice] = useState<SaveNotice | null>(null);
  const inputs = useRef<Partial<Record<DocumentKind, HTMLInputElement | null>>>({});
  const urls = useRef<Partial<Record<DocumentKind, string>>>({});
  const uploading = useRef(false);
  useEffect(() => {
    const previews = urls.current;
    return () => { Object.values(previews).forEach(url => URL.revokeObjectURL(url)); };
  }, []);
  useEffect(() => { onDirtyChange(documentKinds.some(kind => !!selected[kind])); }, [selected, onDirtyChange]);

  function choose(kind: DocumentKind, file?: File) {
    if (!file || uploading.current || setupError) return;
    const previous = urls.current[kind];
    if (previous) URL.revokeObjectURL(previous);
    const error = documentFileError(file);
    const url = error ? '' : URL.createObjectURL(file);
    if (url) urls.current[kind] = url;
    else delete urls.current[kind];
    setSelected(current => ({ ...current, [kind]: { file, url, error } }));
    setNotice(null);
  }

  async function publish(kind: DocumentKind) {
    const selection = selected[kind];
    if (!selection || selection.error || uploading.current || setupError) return;
    uploading.current = true;
    setPending(kind);
    onBusyChange(true);
    setNotice({ status: 'saving', title: `Uploading ${documentLabels[kind]}`, description: 'Your current PDF remains available until the upload is confirmed.' });
    try {
      const error = documentFileError(selection.file, new Uint8Array(await selection.file.arrayBuffer()));
      if (error) {
        setSelected(current => ({ ...current, [kind]: { ...selection, error } }));
        setNotice({ status: 'error', title: 'Check the selected PDF', description: error });
        return;
      }
      const current = documents.find(document => document.kind === kind);
      const form = new FormData();
      form.set('kind', kind);
      form.set('expectedVersion', String(current?.version ?? 0));
      form.set('document', selection.file);
      const result = await uploadDocument(form);
      if (!result.ok) {
        setNotice({ status: 'error', title: `${documentLabels[kind]} update could not be confirmed`, description: result.error });
        return;
      }
      setDocuments(existing => [...existing.filter(document => document.kind !== kind), result.data]);
      onPublished(result.data);
      setSelected(existing => { const next = { ...existing }; delete next[kind]; return next; });
      const url = urls.current[kind];
      if (url) URL.revokeObjectURL(url);
      delete urls.current[kind];
      if (inputs.current[kind]) inputs.current[kind].value = '';
      setNotice({ status: 'success', title: `${documentLabels[kind]} published`, description: 'The new PDF is now available from your website.' });
    } catch {
      setNotice({ status: 'error', title: `${documentLabels[kind]} update could not be confirmed`, description: 'The upload could not be confirmed. Your selected file is still here; try again.' });
    } finally {
      uploading.current = false;
      setPending(null);
      onBusyChange(false);
    }
  }

  return <section className="admin-documents" aria-labelledby="admin-documents-title" aria-busy={!!pending}>
    <header><h2 id="admin-documents-title" className="content-title">Website documents</h2><p className="admin-help">Upload your resume and academic CV. A successful upload publishes the PDF immediately.</p></header>
    {setupError && <p className="admin-document-setup" role="alert">Document storage is unavailable. For the first setup, apply <code>011_portfolio_documents.sql</code> in Supabase. Otherwise check your connection and refresh this dashboard.</p>}
    <div className="admin-document-grid">{documentKinds.map(kind => {
      const current = documents.find(document => document.kind === kind);
      const selection = selected[kind];
      const disabled = !!pending || setupError;
      return <article key={kind} className="admin-document-card card-surface" aria-labelledby={`document-${kind}-title`}>
        <h3 id={`document-${kind}-title`}><FaFilePdf aria-hidden="true" />{documentLabels[kind]}</h3>
        <div className="admin-document-current">
          {current ? <><p className="admin-document-name">{current.original_name}</p><p className="admin-help">{sizeLabel(current.size_bytes)} · Updated {updatedLabel(current.updated_at)}</p></> : <p className="admin-help">Currently using the existing website PDF.</p>}
          <a className="admin-document-link" href={`/api/documents/${kind}${current ? `?v=${current.version}` : ''}`} target="_blank" rel="noopener noreferrer">View current {documentLabels[kind]} ↗</a>
        </div>
        <label className="admin-upload-picker">
          <input ref={element => { inputs.current[kind] = element; }} className="sr-only" type="file" accept="application/pdf,.pdf" aria-label={`Choose ${documentLabels[kind]} PDF`} aria-describedby={`document-${kind}-help${selection?.error ? ` document-${kind}-error` : ''}`} disabled={disabled} onChange={event => choose(kind, event.target.files?.[0])} />
          <span className="admin-upload-icon"><FaCloudUploadAlt aria-hidden="true" /></span>
          <span><span className="admin-upload-label">Choose {current ? 'replacement ' : ''}PDF</span><span id={`document-${kind}-help`} className="admin-help admin-upload-formats">PDF only · Up to {Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024))} MB</span></span>
        </label>
        {selection && <div className="admin-document-selection"><p className="admin-document-name">Selected: {selection.file.name}</p><p className="admin-help">{sizeLabel(selection.file.size)}</p>{selection.url && <a className="admin-document-link" href={selection.url} target="_blank" rel="noopener noreferrer">Preview selected PDF ↗</a>}{selection.error && <p id={`document-${kind}-error`} className="admin-document-error" role="alert">{selection.error}</p>}</div>}
        <button type="button" className="btn-secondary admin-document-publish" disabled={disabled || !selection || !!selection.error} onClick={() => { void publish(kind); }}><FaCloudUploadAlt aria-hidden="true" />{pending === kind ? 'Uploading…' : current ? 'Upload and replace' : 'Upload and publish'}</button>
      </article>;
    })}</div>
    {notice && <SaveNotification notice={notice} onDismiss={() => setNotice(null)} />}
  </section>;
}
