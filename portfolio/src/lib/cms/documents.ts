export const documentKinds = ['resume', 'cv'] as const;
export type DocumentKind = typeof documentKinds[number];
export const documentLabels = { resume: 'Resume', cv: 'Academic CV' } as const;
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const documentFileNames = {
  resume: 'Silas_Osunba_Resume.pdf',
  cv: 'Silas_Osunba_Academic_CV.pdf',
} as const;
export type DocumentRecord = {
  kind: DocumentKind;
  storage_path: string;
  original_name: string;
  size_bytes: number;
  updated_at: string;
  version: number;
};
export function isDocumentKind(value: unknown): value is DocumentKind {
  return value === 'resume' || value === 'cv';
}
export function isDocumentPath(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/.test(value);
}
export function documentUrl(kind: DocumentKind, download = false) {
  return `/api/documents/${kind}${download ? '?download=1' : ''}`;
}
export function documentFileError(file: { name: string; type: string; size: number }, bytes?: Uint8Array): string | null {
  if (!Number.isSafeInteger(file.size) || file.size < 5 || file.size > MAX_DOCUMENT_BYTES) {
    return 'Choose a PDF up to 5 MB.';
  }
  if (!/\.pdf$/i.test(file.name) || file.name.length > 200 || /[/\\]/.test(file.name)
    || Array.from(file.name).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    return 'Choose a .pdf file with a filename of up to 200 characters.';
  }
  // Check the file itself; browser MIME labels can be missing or inaccurate.
  if (bytes && (bytes.byteLength !== file.size || new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-')) {
    return 'The selected file does not contain a PDF. Export your document as a PDF and try again.';
  }
  return null;
}
