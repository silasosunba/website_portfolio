import { documentFileNames, isDocumentKind, isDocumentPath, MAX_DOCUMENT_BYTES, type DocumentKind, type DocumentRecord } from './cms/documents.ts';
import { reportServerError } from './server-logger.ts';

type DocumentStore = {
  read(kind: DocumentKind): Promise<DocumentRecord | null>;
  download(path: string): Promise<Blob>;
};
const responseHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

export async function servePortfolioDocument(request: Request, kind: unknown, store: DocumentStore): Promise<Response> {
  if (!isDocumentKind(kind)) return new Response('Document not found', { status: 404, headers: responseHeaders });
  try {
    const document = await store.read(kind);
    if (!document) {
      // Bundled PDFs remain available before migration/first upload. Relative redirects preserve the origin.
      return new Response(null, { status: 307, headers: { ...responseHeaders, Location: `/documents/${documentFileNames[kind]}` } });
    }
    if (document.kind !== kind || !isDocumentPath(document.storage_path)) throw new Error('Invalid document reference');
    const pdf = await store.download(document.storage_path);
    if (!pdf.size || pdf.size > MAX_DOCUMENT_BYTES) throw new Error('Invalid document download');
    const disposition = new URL(request.url).searchParams.get('download') === '1' ? 'attachment' : 'inline';
    return new Response(pdf, { headers: {
      ...responseHeaders,
      'Content-Type': 'application/pdf',
      'Content-Length': String(pdf.size),
      'Content-Disposition': `${disposition}; filename="${documentFileNames[kind]}"`,
    } });
  } catch {
    const requestId = reportServerError('documents.public_document_unavailable');
    return new Response('This document is temporarily unavailable. Please try again.', {
      status: 503, headers: { ...responseHeaders, 'X-Request-Id': requestId },
    });
  }
}
