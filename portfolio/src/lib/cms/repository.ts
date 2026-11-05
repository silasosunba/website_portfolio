import 'server-only';
import { cache } from 'react';
import { publicClient } from '../supabase/server';
import { contentTables, validWritingSlug, type ArticleRecord, type ContentKind, type ContentMap } from './model';

type PublicContentMap = Omit<ContentMap, 'articles'> & { articles: Omit<ArticleRecord, 'body'> };
export type ContentResult<K extends ContentKind> = { entries: PublicContentMap[K][]; unavailable: boolean };
export async function getPublicContent<K extends ContentKind>(kind: K): Promise<ContentResult<K>> {
  try {
    // Read fresh for every server render, including edits saved through another
    // deployment or directly in Supabase. publicClient uses fetch cache: no-store.
    const { data, error } = await publicClient().from(contentTables[kind]).select(kind === 'articles' ? 'id,title,published,position,version,created_at,updated_at,image_url,image_path,excerpt,date_value,reading_minutes,url,publication_type,slug' : '*').eq('published', true).order(kind === 'articles' ? 'date_value' : 'position', { ascending: kind !== 'articles' }).order('created_at', { ascending: false }).order('id').abortSignal(AbortSignal.timeout(8000)).retry(false);
    if (error) throw new Error(error.code || 'content_unavailable');
    const entries = data as unknown as PublicContentMap[K][];
    return { entries, unavailable: false };
  } catch {
    // Fail closed: never replace database records with static seed data or expose drafts.
    console.error(`Published ${kind} could not be loaded. Check Supabase connectivity and migration 005.`);
    return { entries: [], unavailable: true };
  }
}

// React cache deduplicates metadata/page reads within one server request only.
export const getPublicWriting = cache(async (slug: string): Promise<ArticleRecord | null> => {
  if (!validWritingSlug(slug)) return null;
  const { data, error } = await publicClient().from(contentTables.articles).select('*').eq('slug', slug).eq('publication_type', 'in-app').eq('published', true).abortSignal(AbortSignal.timeout(8000)).retry(false).maybeSingle();
  if (error) throw new Error('This writing could not be loaded. Please try again.');
  return data as ArticleRecord | null;
});
