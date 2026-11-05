'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwner, sessionClient } from '../../lib/supabase/server';
import { contentTables, imageType, isContentKind, isUuid, MAX_IMAGE_BYTES, validateContent, type ActionResult, type ContentKind, type ContentRecord, type WritingBody } from '../../lib/cms/model';

function invalidate(kind: ContentKind) {
  const paths = kind === 'news' ? ['/'] : kind === 'projects' ? ['/projects'] : [`/${kind}`];
  paths.forEach(path => revalidatePath(path));
  if (kind === 'articles') revalidatePath('/articles/[slug]', 'page');
  revalidatePath('/admin');
}
function failure(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : 'The request failed. Your edits are still available.' };
}
export async function signIn(_previous: { error: string }, form: FormData) {
  try {
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    if (!email || !password || email.length > 320 || password.length > 1000) return { error: 'Enter your email and password.' };
    const client = await sessionClient();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) return { error: 'Sign-in failed. Check your credentials and try again.' };
    try { await requireOwner(); } catch { await client.auth.signOut(); return { error: 'This account does not have owner access.' }; }
  } catch { return { error: 'Sign-in is unavailable. Check the Supabase configuration and connection.' }; }
  redirect('/admin');
}
export async function signOut() {
  const client = await sessionClient();
  await client.auth.signOut();
  redirect('/admin/login');
}
export async function saveContent(kind: ContentKind, input: unknown, expected: OrderSnapshot): Promise<ActionResult<ContentRecord[]>> {
  try {
    const { client, user } = await requireOwner();
    if (!isContentKind(kind)) throw new Error('Unknown content section.');
    const raw = input as Record<string, unknown>;
    const values = validateContent(kind, input);
    if (values.image_path && !String(values.image_path).startsWith(`${user.id}/`)) throw new Error('You can only attach your own uploads.');
    if (kind === 'articles' && values.publication_type === 'in-app') {
      const blocks = (values.body as WritingBody).blocks;
      if (blocks.some(block => block.type === 'image' && block.image_path && !block.image_path.startsWith(`${user.id}/`))) throw new Error('You can only attach your own writing images.');
    }
    // Existing seeded covers may remain, but new/replacement covers must be uploads.
    if (kind !== 'news' && values.image_url) {
      if (!isUuid(raw.id)) throw new Error('Upload an image file instead of entering an image URL.');
      const { data: existing, error: readError } = await client.from(contentTables[kind]).select('image_url').eq('id', raw.id).maybeSingle();
      if (readError || !existing) throw new Error('Could not verify the existing image. Reload the entry and try again.');
      if (existing.image_url !== values.image_url) throw new Error('Upload an image file to replace the current image.');
    }
    if (raw.id !== undefined && (!isUuid(raw.id) || !Number.isSafeInteger(raw.version) || Number(raw.version) < 1)) throw new Error('Invalid record version. Reload this entry.');
    if (raw.id !== undefined && (!Array.isArray(expected) || !expected.some(entry => entry.id === raw.id && entry.version === raw.version))) throw new Error('This entry changed. Reload it before saving again.');
    const data = await mutateOrdered(client, kind, 'save', expected, { p_values: values, p_id: raw.id ?? null });
    invalidate(kind);
    return { ok: true, data: data as ContentRecord[] };
  } catch (error) { return failure(error); }
}
type OrderSnapshot = { id: string; version: number }[];
async function mutateOrdered(client: Awaited<ReturnType<typeof sessionClient>>, kind: ContentKind, operation: string, expected: OrderSnapshot, options: Record<string, unknown> = {}): Promise<ContentRecord[]> {
  if (!Array.isArray(expected) || expected.some(entry => !entry || !isUuid(entry.id) || !Number.isSafeInteger(entry.version) || entry.version < 1) || new Set(expected.map(entry => entry.id)).size !== expected.length) throw new Error('Invalid list snapshot. Reload the dashboard.');
  const { data, error } = await client.rpc('portfolio_mutate_ordered', { p_kind: kind, p_operation: operation, p_expected: expected, ...options });
  if (error?.code === '40001') throw new Error('Content changed in another tab. Reload the dashboard before trying again.');
  if (error?.code === 'PGRST202' || error?.code === '42883') throw new Error('Apply 007_content_ordering.sql in Supabase SQL Editor, then reload the dashboard.');
  if (kind === 'articles' && error?.code === '23505') throw new Error('That article URL slug is already used. Choose a different slug.');
  if (kind === 'articles' && error && (['PGRST204', '42703'].includes(error.code) || error.message.includes('Invalid content fields'))) throw new Error('Apply 008_in_app_writings.sql in Supabase SQL Editor, then reload the dashboard.');
  if (error || !Array.isArray(data)) throw new Error('Could not save the list. Check your connection and database setup. No partial order was saved.');
  return data as ContentRecord[];
}
export async function deleteContent(kind: ContentKind, id: string, expected: OrderSnapshot): Promise<ActionResult<ContentRecord[]>> {
  try {
    const { client } = await requireOwner();
    if (!isContentKind(kind) || !isUuid(id)) throw new Error('Invalid entry.');
    const data = await mutateOrdered(client, kind, 'delete', expected, { p_id: id });
    invalidate(kind);
    return { ok: true, data };
  } catch (error) { return failure(error); }
}
export async function reorderContent(kind: ContentKind, ids: string[], expected: OrderSnapshot): Promise<ActionResult<ContentRecord[]>> {
  try {
    const { client } = await requireOwner();
    if (!isContentKind(kind) || !Array.isArray(ids) || ids.some(id => !isUuid(id)) || new Set(ids).size !== ids.length) throw new Error('Invalid entry order.');
    const data = await mutateOrdered(client, kind, 'reorder', expected, { p_order: ids });
    invalidate(kind);
    return { ok: true, data };
  } catch (error) { return failure(error); }
}
export async function uploadImage(form: FormData): Promise<ActionResult<{ path: string }>> {
  try {
    const { client, user } = await requireOwner();
    const file = form.get('image');
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_IMAGE_BYTES) throw new Error('Choose a PNG, JPEG, WebP, or GIF up to 5 MB.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = imageType(bytes);
    if (!type || file.type !== type.mime) throw new Error('The image contents must match its PNG, JPEG, WebP, or GIF file type.');
    const path = `${user.id}/${crypto.randomUUID()}.${type.extension}`;
    const { error } = await client.storage.from('portfolio-media').upload(path, bytes, { contentType: type.mime, upsert: false, cacheControl: '0' });
    if (error) throw new Error('Image upload failed. Check the storage policies and connection.');
    return { ok: true, data: { path } };
  } catch (error) { return failure(error); }
}
