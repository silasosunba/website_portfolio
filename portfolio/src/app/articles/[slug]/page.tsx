import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicWriting } from '../../../lib/cms/repository';
import WritingArticle from '../../../components/content/WritingArticle';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublicWriting(slug);
  if (!post) return { title: 'Writing not found', robots: { index: false, follow: false } };
  return { title: post.title, description: post.excerpt, alternates: { canonical: `/articles/${post.slug}` }, openGraph: { type: 'article', title: post.title, description: post.excerpt, publishedTime: post.date_value, authors: ['Silas Osunba'] } };
}
export default async function WritingPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPublicWriting(slug);
  if (!post) notFound();
  return <div className="writing-page page-shell"><Link className="writing-back-link" href="/articles">← All writings</Link><WritingArticle post={post} /></div>;
}
