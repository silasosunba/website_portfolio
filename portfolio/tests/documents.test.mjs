import test from 'node:test';
import assert from 'node:assert/strict';
import {
  documentFileError,
  documentFileNames,
  documentUrl,
  isDocumentKind,
  isDocumentPath,
  MAX_DOCUMENT_BYTES,
} from '../src/lib/cms/documents.ts';
import { servePortfolioDocument } from '../src/lib/document-response.ts';

const owner = '00000000-0000-4000-8000-000000000001';
const objectId = '10000000-0000-4000-8000-000000000001';
const path = `${owner}/${objectId}.pdf`;
const pdfBytes = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
const pdfFile = (patch = {}) => ({ name: 'Academic CV.pdf', type: 'application/pdf', size: pdfBytes.length, ...patch });
const record = (kind = 'resume', patch = {}) => ({
  kind,
  storage_path: path,
  original_name: 'untrusted"\r\nname.pdf',
  size_bytes: pdfBytes.length,
  updated_at: '2026-11-05T00:00:00Z',
  version: 1,
  ...patch,
});
const request = (kind = 'resume', query = '') => new Request(`https://silasosunba.com/api/documents/${kind}${query}`);

function storeFor(document = record(), blob = new Blob([pdfBytes], { type: 'application/octet-stream' })) {
  const reads = [];
  const downloads = [];
  return {
    reads,
    downloads,
    read: async kind => { reads.push(kind); return document; },
    download: async key => { downloads.push(key); return blob; },
  };
}

function assertPrivateResponse(response) {
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
}

test('document slots and storage paths only accept the two known PDFs and safe immutable keys', () => {
  for (const kind of ['resume', 'cv']) {
    assert.equal(isDocumentKind(kind), true);
    assert.equal(documentUrl(kind), `/api/documents/${kind}`);
    assert.equal(documentUrl(kind, true), `/api/documents/${kind}?download=1`);
  }
  for (const kind of ['', 'CV', 'academic-cv', '../resume', null, 1]) assert.equal(isDocumentKind(kind), false);
  assert.equal(isDocumentPath(path), true);
  for (const key of [null, '', '../cv.pdf', `${owner}/../../cv.pdf`, `${owner}/${objectId}.png`, `${owner}/${objectId}.pdf?download=1`, `https://example.com/${path}`, `/${path}`]) {
    assert.equal(isDocumentPath(key), false);
  }
});

test('PDF validation accepts PDF-signature bytes regardless of an absent or inaccurate browser MIME label', () => {
  for (const type of ['application/pdf', '', 'application/octet-stream']) {
    assert.equal(documentFileError(pdfFile({ type }), pdfBytes), null);
  }
  assert.equal(documentFileError(pdfFile({ name: 'Resume.PDF' }), pdfBytes), null);
});

test('PDF validation rejects empty or oversized files, unsafe filenames, and renamed non-PDF contents', () => {
  for (const size of [0, -1, 4, MAX_DOCUMENT_BYTES + 1, 1.5, Number.NaN]) {
    assert.equal(typeof documentFileError(pdfFile({ size })), 'string');
  }
  for (const name of ['resume.txt', 'resume.pdf.exe', '../resume.pdf', 'folder/resume.pdf', 'folder\\resume.pdf', 'resume\n.pdf', `${'a'.repeat(197)}.pdf`]) {
    assert.equal(typeof documentFileError(pdfFile({ name }), pdfBytes), 'string');
  }
  const html = new TextEncoder().encode('<html>This is not a PDF.</html>');
  assert.equal(typeof documentFileError(pdfFile({ name: 'renamed.pdf', size: html.length }), html), 'string');
  assert.equal(typeof documentFileError(pdfFile({ size: pdfBytes.length + 1 }), pdfBytes), 'string');
});

test('current document responses stream the selected PDF with fixed inline or download filenames', async t => {
  for (const kind of ['resume', 'cv']) for (const [query, disposition] of [['', 'inline'], ['?download=1', 'attachment']]) {
    await t.test(`${kind} ${disposition}`, async () => {
      const store = storeFor(record(kind));
      const response = await servePortfolioDocument(request(kind, query), kind, store);
      assert.equal(response.status, 200);
      assertPrivateResponse(response);
      assert.equal(response.headers.get('content-type'), 'application/pdf');
      assert.equal(response.headers.get('content-length'), String(pdfBytes.length));
      assert.equal(response.headers.get('content-disposition'), `${disposition}; filename="${documentFileNames[kind]}"`);
      assert.equal(response.headers.has('location'), false);
      assert.deepEqual(new Uint8Array(await response.arrayBuffer()), pdfBytes);
      assert.deepEqual(store.reads, [kind]);
      assert.deepEqual(store.downloads, [path]);
    });
  }
});

test('missing uploads redirect to the retained bundled PDF without reading storage', async () => {
  for (const kind of ['resume', 'cv']) {
    const store = storeFor(null);
    const response = await servePortfolioDocument(request(kind), kind, store);
    assert.equal(response.status, 307);
    assertPrivateResponse(response);
    assert.equal(response.headers.get('location'), `/documents/${documentFileNames[kind]}`);
    assert.deepEqual(store.reads, [kind]);
    assert.deepEqual(store.downloads, []);
  }
});

test('unknown document slots return 404 without database or storage calls', async () => {
  const store = storeFor();
  const response = await servePortfolioDocument(request('unknown'), 'unknown', store);
  assert.equal(response.status, 404);
  assertPrivateResponse(response);
  assert.equal(response.headers.has('location'), false);
  assert.deepEqual(store.reads, []);
  assert.deepEqual(store.downloads, []);
});

test('broken metadata or storage returns a safe 503 instead of silently serving an old PDF', async t => {
  const diagnostic = 'PRIVATE_STORAGE_OR_DATABASE_DIAGNOSTIC';
  const cases = [
    ['metadata read failed', () => ({ read: async () => { throw new Error(diagnostic); }, download: async () => { assert.fail('Storage must not be read'); } })],
    ['storage download failed', () => ({ read: async () => record(), download: async () => { throw new Error(diagnostic); } })],
    ['unsafe storage path', () => ({ read: async () => record('resume', { storage_path: '../private.pdf' }), download: async () => { assert.fail('Invalid storage path must not be fetched'); } })],
    ['wrong document kind', () => ({ read: async () => record('cv'), download: async () => { assert.fail('Wrong document slot must not be fetched'); } })],
    ['empty storage object', () => storeFor(record(), new Blob([]))],
    ['oversized storage object', () => storeFor(record(), new Blob([new Uint8Array(MAX_DOCUMENT_BYTES + 1)]))],
  ];
  for (const [label, createStore] of cases) await t.test(label, async t => {
    const logs = t.mock.method(console, 'error', () => {});
    const response = await servePortfolioDocument(request(), 'resume', createStore());
    assert.equal(response.status, 503);
    assertPrivateResponse(response);
    assert.equal(response.headers.has('location'), false);
    assert.match(response.headers.get('x-request-id'), /^[0-9a-f-]{36}$/i);
    assert.equal((await response.text()).includes(diagnostic), false);
    assert.equal(logs.mock.callCount(), 1);
    const event = logs.mock.calls[0].arguments[0];
    assert.equal(event.event, 'documents.public_document_unavailable');
    assert.equal(event.requestId, response.headers.get('x-request-id'));
    assert.equal(JSON.stringify(event).includes(diagnostic), false);
  });
});
