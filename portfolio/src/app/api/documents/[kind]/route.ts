import { publicClient } from '../../../../lib/supabase/server';
import { servePortfolioDocument } from '../../../../lib/document-response';
import type { DocumentRecord } from '../../../../lib/cms/documents';

export const dynamic = 'force-dynamic';
export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  return servePortfolioDocument(request, kind, {
    async read(selected) {
      const client = publicClient();
      const { data, error } = await client.from('portfolio_documents').select('*').eq('kind', selected).abortSignal(AbortSignal.timeout(8000)).retry(false).maybeSingle();
      // Older deployments keep their current bundled PDFs until the document migration is applied.
      if (error && ['42P01', 'PGRST205'].includes(error.code)) return null;
      if (error) throw new Error('Document metadata unavailable');
      return data as DocumentRecord | null;
    },
    async download(path) {
      const { data, error } = await publicClient().storage.from('portfolio-documents').download(path);
      if (error || !data) throw new Error('Document storage unavailable');
      return data;
    },
  });
}
