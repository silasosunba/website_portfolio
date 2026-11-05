'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { deleteContent, reorderContent, saveContent, signOut, uploadImage } from '../../app/admin/actions';
import { blankWritingBody, compareWritingsNewestFirst, writingReadingMinutes, contentKinds, contentLabels, emptyDraft, imageFor, MAX_IMAGE_BYTES, validateContent, type ArticleRecord, type BookRecord, type ContentKind, type ContentRecord, type NewsBody, type NewsRecord, type ProjectRecord, type WritingBody } from '../../lib/cms/model';
import { ArticleList, BookList, NewsList, ProjectList } from '../content/ContentLists';
import { FaCloudUploadAlt, FaSignOutAlt } from 'react-icons/fa';
import NewsEditor from './NewsEditor';
import DocumentsManager from './DocumentsManager';
import type { DocumentRecord } from '../../lib/cms/documents';
import OrderedEntryList from './OrderedEntryList';
import WritingEditor from './WritingEditor';
import WritingArticle from '../content/WritingArticle';
import ConfirmationDialog from './ConfirmationDialog';
import ContentPreview from './ContentPreview';
import EntryEditorDialog from './EntryEditorDialog';
import SaveNotification, { type SaveNotice } from './SaveNotification';

type Draft = Record<string, unknown>;
type PendingAction = { type: 'select'; kind: ContentKind; record?: ContentRecord; openEditor: boolean } | { type: 'signout' } | { type: 'close' } | { type: 'documents' };
function Preview({ kind, record }: { kind: ContentKind; record: ContentRecord }) {
  if (kind === 'news') return <div className="home-news"><NewsList entries={[record as NewsRecord]} /></div>;
  if (kind === 'projects') return <ProjectList entries={[record as ProjectRecord]} />;
  if (kind === 'articles') return (record as ArticleRecord).publication_type === 'in-app' ? <WritingArticle post={record as ArticleRecord} /> : <ArticleList entries={[record as ArticleRecord]} />;
  return <BookList entries={[record as BookRecord]} />;
}
export default function AdminDashboard({ initialRecords, setupError, initialDocuments, documentSetupError }: { initialRecords: Record<ContentKind, ContentRecord[]>; setupError: boolean; initialDocuments: DocumentRecord[]; documentSetupError: boolean }) {
  const [records, setRecords] = useState(initialRecords);
  const [kind, setKind] = useState<ContentKind>('news');
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [documents, setDocuments] = useState(initialDocuments);
  const [documentDirty, setDocumentDirty] = useState(false);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft('news'));
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [discardError, setDiscardError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const locked = busy || dragging || documentBusy;
  const hasUnsavedChanges = dirty || documentDirty;
  const snapshot = (section: ContentKind) => records[section].map(({ id, version }) => ({ id, version }));
  const [message, setMessage] = useState('');
  const [saveNotice, setSaveNotice] = useState<SaveNotice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: ContentKind; record: ContentRecord } | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [preview, setPreview] = useState<ContentRecord | null>(null);
  const [writingEditorError, setWritingEditorError] = useState('');
  const visibleRecords = kind === 'articles' ? [...records.articles as ArticleRecord[]].sort(compareWritingsNewestFirst) : records[kind];
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedChanges]);
  function change(patch: Draft) { setDraft(previous => ({ ...previous, ...patch })); setDirty(true); setPreview(null); setPreviewError(''); }
  function applySelection(next: ContentKind, record?: ContentRecord, openEditor = true) {
    setDocumentsOpen(false); setDocumentDirty(false);
    setWritingEditorError(''); setSaveNotice(null); setEditorOpen(openEditor); setKind(next); setDraft(record ? { ...record, position: records[next].findIndex(entry => entry.id === record.id) } : emptyDraft(next)); setDirty(false); setPreview(null); setPreviewError(''); setMessage('');
  }
  function select(next: ContentKind, record?: ContentRecord, openEditor = true) {
    if (hasUnsavedChanges) { setDiscardError(''); setPendingAction({ type: 'select', kind: next, record, openEditor }); }
    else applySelection(next, record, openEditor);
  }
  function showDocuments() {
    setDocumentsOpen(true); setEditorOpen(false); setDirty(false); setPreview(null); setSaveNotice(null); setMessage('');
  }
  function selectDocuments() {
    if (documentsOpen || locked) return;
    if (hasUnsavedChanges) { setDiscardError(''); setPendingAction({ type: 'documents' }); }
    else showDocuments();
  }
  function closeEditor() {
    if (busy) return;
    if (dirty) { setDiscardError(''); setPendingAction({ type: 'close' }); }
    else { setEditorOpen(false); setSaveNotice(null); }
  }
  async function leaveDashboard() {
    setBusy(true);
    try { await signOut(); }
    catch { setDiscardError('Could not sign out. Please try again.'); setMessage('Could not sign out. Please try again.'); }
    finally { setBusy(false); }
  }
  function confirmDiscard() {
    if (!pendingAction || busy) return;
    if (pendingAction.type === 'select') {
      applySelection(pendingAction.kind, pendingAction.record, pendingAction.openEditor);
      setPendingAction(null);
    } else if (pendingAction.type === 'close') {
      setDirty(false); setPreview(null); setEditorOpen(false); setPendingAction(null); setSaveNotice(null);
    } else if (pendingAction.type === 'documents') {
      showDocuments(); setPendingAction(null);
    } else { void leaveDashboard(); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || writingEditorError) return;
    setBusy(true); setMessage('');
    setSaveNotice({ status: 'saving', title: draft.published ? 'Saving and publishing…' : 'Saving draft…', description: 'Please wait while your changes are saved.' });
    try {
      const result = await saveContent(kind, draft, snapshot(kind));
      if (!result.ok) {
        setSaveNotice({ status: 'error', title: 'Could not save your changes', description: `${result.error} Your edits are still in the form.` });
        return;
      }
      setRecords(previous => ({ ...previous, [kind]: result.data }));
      setEditorOpen(false); setDraft(emptyDraft(kind)); setDirty(false); setPreview(null);
      setSaveNotice({ status: 'success', title: draft.published ? 'Saved and published successfully' : 'Draft saved successfully', description: draft.published ? 'Your changes are saved and available on the public page.' : 'Your changes are saved privately. Only you can see this draft.' });
    } catch {
      setSaveNotice({ status: 'error', title: 'Save could not be confirmed', description: 'The connection was interrupted. Your edits are still in the form. Check your connection and try again. If the entry changed, reload it before retrying.' });
    } finally { setBusy(false); }
  }
  async function remove() {
    if (!deleteTarget || busy) return;
    const { kind: targetKind, record } = deleteTarget;
    setBusy(true); setMessage(''); setDeleteError('');
    try {
      const result = await deleteContent(targetKind, record.id, snapshot(targetKind));
      if (!result.ok) { setDeleteError(result.error); return; }
      setRecords(previous => ({ ...previous, [targetKind]: result.data }));
      if (draft.id === record.id) { setDraft(emptyDraft(kind)); setDirty(false); setPreview(null); }
      setDeleteTarget(null); setMessage('Entry deleted.');
    } catch { setDeleteError('Could not delete. Please check the connection and try again.'); }
    finally { setBusy(false); }
  }
  async function reorder(ids: string[]) {
    if (busy || setupError) return;
    setBusy(true);
    setSaveNotice({ status: 'saving', title: 'Saving order…', description: 'Updating entry positions.' });
    try {
      const result = await reorderContent(kind, ids, snapshot(kind));
      if (!result.ok) { setSaveNotice({ status: 'error', title: 'Could not save order', description: result.error }); return; }
      setRecords(previous => ({ ...previous, [kind]: result.data }));
      setSaveNotice({ status: 'success', title: 'Order saved', description: 'Entry positions have been updated on the public page.' });
    } catch {
      setSaveNotice({ status: 'error', title: 'Order could not be confirmed', description: 'Check your connection, then reload the dashboard before retrying.' });
    } finally { setBusy(false); }
  }
  async function upload(file?: File, attachCover = true): Promise<string | null> {
    if (!file) return null;
    if (file.size > MAX_IMAGE_BYTES) { setMessage('Choose an image up to 5 MB.'); return null; }
    setBusy(true); setMessage('Uploading image…');
    try {
      const form = new FormData(); form.set('image', file);
      const result = await uploadImage(form);
      if (!result.ok) { setMessage(result.error); return null; }
      if (attachCover) change({ image_path: result.data.path, image_url: '' });
      setMessage('Image uploaded privately. Save the entry to attach it.');
      return result.data.path;
    } catch { setMessage('Upload interrupted. Please try again.'); return null; }
    finally { setBusy(false); }
  }
  const field = (name: string, label: string, options: { type?: string; required?: boolean; max?: number } = {}) => <label className="admin-field">{label}<input type={options.type ?? 'text'} value={String(draft[name] ?? '')} required={options.required} maxLength={options.max ?? 2048} onChange={e => change({ [name]: e.target.value })} /></label>;
  const area = (name: string, label: string, max: number) => <label className="admin-field">{label}<textarea rows={5} value={String(draft[name] ?? '')} maxLength={max} onChange={e => change({ [name]: e.target.value })} /></label>;
  const selectedImage = imageFor({ image_path: String(draft.image_path ?? ''), image_url: String(draft.image_url ?? '') });
  return <div className="admin-page page-shell">
    <header className="admin-dashboard-header mb-6"><div className="admin-dashboard-heading"><h1 className="page-title">Your portfolio</h1><p className="admin-help">Create, preview, and publish your updates.</p></div><form className="admin-signout" onSubmit={event => { event.preventDefault(); if (hasUnsavedChanges) { setDiscardError(''); setPendingAction({ type: 'signout' }); } else { void leaveDashboard(); } }}><button className="btn-secondary" disabled={locked}><FaSignOutAlt aria-hidden="true" />Sign out</button></form></header>
    {setupError && !documentsOpen && <p role="alert" className="admin-message">Database setup is incomplete or unavailable. Apply migration 005_portfolio_cms.sql, then reload. Editing is disabled until all four tables can be read.</p>}
    <nav className="admin-sections" aria-label="Content sections">{contentKinds.map(section => <button type="button" key={section} aria-pressed={!documentsOpen && kind === section} disabled={locked} onClick={() => select(section, undefined, false)}>{contentLabels[section]} <span>{records[section].length}</span></button>)}<button type="button" aria-pressed={documentsOpen} disabled={locked} onClick={selectDocuments}>Documents</button></nav>
    {message && <p role="status" className="admin-message">{message}</p>}
    {documentsOpen ? <DocumentsManager initialDocuments={documents} setupError={documentSetupError} onDirtyChange={setDocumentDirty} onBusyChange={setDocumentBusy} onPublished={document => setDocuments(current => [...current.filter(entry => entry.kind !== document.kind), document])} /> : <div className="admin-workspace">
      <section className="admin-entry-list"><div className="admin-toolbar"><h2 className="content-title">{contentLabels[kind]}</h2><button className="btn-secondary" type="button" disabled={locked || setupError} onClick={() => select(kind)}>New entry</button></div>
        {!records[kind].length && <p className="admin-help mt-4">No entries yet. Create a draft to get started.</p>}
        <OrderedEntryList key={kind} records={visibleRecords} dateOrdered={kind === 'articles'} disabled={busy || setupError} onDraggingChange={setDragging} onReorder={reorder} onEdit={record => select(kind, record)} onDelete={record => { setDeleteError(''); setDeleteTarget({ kind, record }); }} />
      </section>
    </div>}
    {editorOpen && <EntryEditorDialog title={`${draft.id ? 'Edit' : 'New'} ${contentLabels[kind].toLowerCase()} entry`} busy={busy} onClose={closeEditor}>
      {message && <p role="status" className="admin-message entry-editor-message">{message}</p>}
      <form onSubmit={save} className="admin-editor"><fieldset disabled={busy || setupError}>
        <legend className="sr-only">{draft.id ? 'Edit' : 'New'} {contentLabels[kind].toLowerCase()} entry</legend>
        {field('title', kind === 'news' ? 'Internal title (for your dashboard)' : 'Title', { required: true, max: 300 })}
        {kind === 'news' && <>{field('date_label', 'Display date (e.g. Oct 2026)', { required: true, max: 80 })}{field('date_value', 'Sort/reference date (YYYY, YYYY-MM, or YYYY-MM-DD)', { required: true, max: 10 })}<NewsEditor value={draft.body as NewsBody} onChange={body => change({ body })} /></>}
        {kind === 'projects' && <>{area('description', 'Project description', 20000)}<fieldset className="admin-categories"><legend>Category</legend>{['Engineering', 'Civic'].map(category => <label key={category}><input type="checkbox" checked={(draft.categories as string[]).includes(category)} onChange={e => change({ categories: e.target.checked ? [...draft.categories as string[], category] : (draft.categories as string[]).filter(value => value !== category) })} /> {category}</label>)}</fieldset>{field('credit', 'Contributors / credit', { max: 500 })}{field('date_label', 'Project dates (optional)', { max: 80 })}{field('link_url', 'Main project link', { required: true, type: 'url' })}{field('code_url', 'Code link (optional)', { type: 'url' })}{field('demo_url', 'Demo link (optional)', { type: 'url' })}</>}
        {kind === 'articles' && <>
          <label className="admin-field">Publish location<select value={String(draft.publication_type ?? 'medium')} onChange={event => { setWritingEditorError(''); change({ publication_type: event.target.value }); }}><option value="medium">On Medium</option><option value="in-app">On this website</option></select></label>
          {draft.publication_type !== 'in-app' && (draft.body as WritingBody | undefined)?.blocks.length ? <p className="admin-help">Saving as a Medium link removes the saved in-app article text and URL. Switch back before saving to keep editing it.</p> : null}
          {area('excerpt', 'Writing excerpt', 5000)}{field('date_value', 'Publication date', { type: 'date', required: true })}
          {draft.publication_type === 'in-app' ? <>
            {field('slug', 'Article URL slug (optional; generated from the title when blank)', { max: 100 })}
            <p className="admin-help">Your article will open at /articles/your-slug. Use lowercase letters, numbers, and hyphens. Changing a saved slug changes its URL.</p>
            <WritingEditor value={(draft.body as WritingBody) ?? blankWritingBody()} onChange={body => change({ body })} onUpload={file => upload(file, false)} disabled={busy || setupError} onError={error => { setWritingEditorError(error); if (error) setDirty(true); }} />
            <p className="admin-help">Estimated reading time: {writingReadingMinutes((draft.body as WritingBody) ?? blankWritingBody())} min</p>
          </> : <><label className="admin-field">Reading time (minutes)<input type="number" min={1} max={300} value={Number(draft.reading_minutes)} required onChange={e => change({ reading_minutes: Number(e.target.value) })} /></label>{field('url', 'Medium writing URL', { type: 'url', required: true })}</>}
        </>}
        {kind === 'books' && <>{field('author', 'Author', { max: 300 })}{area('body', 'Notes / thoughts', 30000)}{field('date_label', 'Reading date (optional)', { max: 80 })}{field('url', 'Book link (optional)', { type: 'url' })}<label className="admin-field">Reading status<select value={String(draft.status)} onChange={e => change({ status: e.target.value })}><option value="planned">Want to read</option><option value="in-progress">Reading</option><option value="completed">Completed</option></select></label></>}
        {kind !== 'news' && <fieldset className="admin-image"><legend>Image</legend><label className="admin-upload-picker">
          <input className="sr-only" type="file" aria-label={selectedImage ? 'Choose a replacement image' : 'Choose an image'} aria-describedby="upload-formats" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
          <span className="admin-upload-icon"><FaCloudUploadAlt aria-hidden="true" /></span>
          <span><span className="admin-upload-label">{selectedImage ? 'Choose replacement image' : 'Choose image'}</span><span id="upload-formats" className="admin-help admin-upload-formats">PNG, JPEG, WebP, or GIF · Up to 5 MB</span></span>
        </label>{selectedImage && <><img src={selectedImage} alt="Selected cover" className="admin-image-preview" /><button type="button" className="btn-secondary" onClick={() => change({ image_path: '', image_url: '' })}>Remove from entry</button></>}<p className="admin-help">Upload a file to add or replace an image. Uploads are private until attached to a published entry.</p></fieldset>}
        {kind !== 'articles' && <label className="admin-field">Insert at position (0 is first; other entries shift automatically)<input type="number" min={0} max={Math.max(0, records[kind].length - (draft.id ? 1 : 0))} step={1} value={Number(draft.position)} required onChange={e => change({ position: Number(e.target.value) })} /></label>}
        <label className="admin-publish"><input type="checkbox" checked={Boolean(draft.published)} onChange={e => change({ published: e.target.checked })} /> Published — visible to everyone</label>
        <div className="admin-toolbar"><button className="btn-primary" disabled={!!writingEditorError}>{busy ? 'Working…' : draft.published ? 'Save and publish' : 'Save draft'}</button><button type="button" className="btn-secondary" disabled={!!writingEditorError} aria-describedby={previewError ? 'preview-error' : undefined} onClick={() => { try { const values = validateContent(kind, draft); setPreview({ ...values, id: String(draft.id ?? 'preview') } as ContentRecord); setPreviewError(''); setMessage(''); } catch (error) { setPreviewError(error instanceof Error ? error.message : 'Check your fields.'); } }}>Preview</button></div>
        {previewError && <p id="preview-error" role="alert" className="admin-preview-error">{previewError}</p>}
      </fieldset></form>
      {saveNotice && <SaveNotification notice={saveNotice} onDismiss={() => setSaveNotice(null)} />}
    </EntryEditorDialog>}
    {!editorOpen && saveNotice && <SaveNotification notice={saveNotice} onDismiss={() => setSaveNotice(null)} />}
    {preview && <ContentPreview onClose={() => setPreview(null)}><Preview kind={kind} record={preview} /></ContentPreview>}
    {pendingAction && <ConfirmationDialog intent="discard" title={documentsOpen ? 'Selected PDF upload' : String(draft.title || 'Untitled entry')} busy={busy} error={discardError} onCancel={() => { if (!busy) setPendingAction(null); }} onConfirm={confirmDiscard} />}
    {deleteTarget && <ConfirmationDialog title={deleteTarget.record.title} busy={busy} error={deleteError} onCancel={() => { if (!busy) setDeleteTarget(null); }} onConfirm={() => { void remove(); }} />}
  </div>;
}
