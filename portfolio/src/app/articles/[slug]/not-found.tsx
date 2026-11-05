import Link from 'next/link';
export default function WritingNotFound() {
  return <div className="writing-page page-shell"><h1 className="page-title">Writing not found</h1><p className="my-6">This writing isn’t available. It may have moved or is no longer published.</p><Link href="/articles">← All writings</Link></div>;
}
