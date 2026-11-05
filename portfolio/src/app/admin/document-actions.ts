'use server';

import { revalidatePath } from 'next/cache';
import { requireOwner } from '../../lib/supabase/server';
import { documentFileError, isDocumentKind, type DocumentRecord } from '../../lib/cms/documents';
import type { ActionResult } from '../../lib/cms/model';
import { reportServerError } from '../../lib/server-logger';

export async function uploadDocument(form: FormData): Promise<ActionResult<DocumentRecord>> {
  let owner: Awaited<ReturnType<typeof requireOwner>>;
  try { owner = await requireOwner(); }
  catch { return { ok: false, error: 'Please sign in with the owner account before uploading documents.' }; }
  const { client, user } = owner;
  const kind = form.get('kind');
  const rawVersion = form.get('expectedVersion');
  const file = form.get('document');
  if (!isDocumentKind(kind) || typeof rawVersion !== 'string' || !/^(0|[1-9]\d{0,9})$/.test(rawVersion)
    || Number(rawVersion) > 2147483647 || !(file instanceof File)) {
    return { ok: false, error: 'Choose a document and PDF file, then try again.' };
  }
  let uploadedPath: string | null = null;
  let published = false;
  let publicationAttempted = false;
  let publicationRejected = false;
  try {
    const fileError = documentFileError(file);
    if (fileError) return { ok: false, error: fileError };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentsError = documentFileError(file, bytes);
    if (contentsError) return { ok: false, error: contentsError };

    const { data: previous, error: readError } = await client.from('portfolio_documents').select('*').eq('kind', kind).abortSignal(AbortSignal.timeout(8000)).maybeSingle();
    if (readError) return { ok: false, error: 'Document storage is unavailable. Apply 011_portfolio_documents.sql for the first setup, or check your connection and reload.' };
    if ((previous?.version ?? 0) !== Number(rawVersion)) {
      return { ok: false, error: 'This document changed in another tab. Reload the dashboard before replacing it.' };
    }
    const path = `${user.id}/${crypto.randomUUID()}.pdf`;
    const { error: uploadError } = await client.storage.from('portfolio-documents').upload(path, bytes, {
      contentType: 'application/pdf', upsert: false, cacheControl: '0',
    });
    if (uploadError) {
      reportServerError('documents.upload_failed');
      return { ok: false, error: 'The PDF could not be uploaded. Check your connection and document storage setup, then try again.' };
    }
    uploadedPath = path;
    publicationAttempted = true;
    const { data, error } = await client.rpc('portfolio_publish_document', {
      p_kind: kind, p_storage_path: path, p_original_name: file.name,
      p_size_bytes: file.size, p_expected_version: Number(rawVersion),
    });
    if (error || !data || data.storage_path !== path || data.kind !== kind) {
      publicationRejected = !!error && ['40001', '22023', '23505', '23514', '42501', 'PGRST202', '42883'].includes(error.code);
      reportServerError('documents.publish_failed');
      const message = error?.code === '40001'
        ? 'This document changed in another tab. Reload the dashboard before replacing it.'
        : error && ['PGRST202', '42883'].includes(error.code)
          ? 'Apply 011_portfolio_documents.sql in Supabase SQL Editor, then reload the dashboard.'
          : 'Publication could not be confirmed. Reload the dashboard before retrying; the public document link remains available.';
      return { ok: false, error: message };
    }
    published = true;
    // Storage policies prevent deletion if another current document still references the object.
    if (previous?.storage_path && previous.storage_path !== path) {
      try {
        const { error: cleanupError } = await client.storage.from('portfolio-documents').remove([previous.storage_path]);
        if (cleanupError) reportServerError('documents.cleanup_failed');
      } catch { reportServerError('documents.cleanup_failed'); }
    }
    revalidatePath('/admin');
    revalidatePath(`/api/documents/${kind}`);
    return { ok: true, data: data as DocumentRecord };
  } catch {
    reportServerError('documents.upload_failed');
    return { ok: false, error: 'The upload could not be confirmed. Reload the dashboard before retrying.' };
  } finally {
    if (uploadedPath && !published && (!publicationAttempted || publicationRejected)) {
      // A timed-out RPC may still be committing. Retain that upload until its outcome is known.
      try {
        const { error } = await client.storage.from('portfolio-documents').remove([uploadedPath]);
        if (error) reportServerError('documents.cleanup_failed');
      } catch { reportServerError('documents.cleanup_failed'); }
    }
  }
}
