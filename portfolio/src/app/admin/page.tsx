import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import AdminDashboard from '../../components/admin/AdminDashboard';
import { requireOwner } from '../../lib/supabase/server';
import { contentKinds, contentTables, type ContentKind, type ContentRecord } from '../../lib/cms/model';
export const metadata: Metadata = { title: 'Admin', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default async function AdminPage() {
  const owner = await requireOwner().catch(() => null);
  if (!owner) redirect('/admin/login');
  const records: Record<ContentKind, ContentRecord[]> = { news: [], projects: [], articles: [], books: [] };
  const results = await Promise.all(contentKinds.map(async kind => {
    const { data, error } = await owner.client.from(contentTables[kind]).select('*').order(kind === 'articles' ? 'date_value' : 'position', { ascending: kind !== 'articles' }).order('created_at', { ascending: false }).order('id');
    if (!error) records[kind] = data as ContentRecord[];
    return Boolean(error);
  }));
  return <AdminDashboard initialRecords={records} setupError={results.some(Boolean)} />;
}
