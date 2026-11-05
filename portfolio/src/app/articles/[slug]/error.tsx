'use client';
import Link from 'next/link';
export default function WritingError({ reset }: { reset: () => void }) {
  return <div className="writing-page page-shell"><h1 className="page-title">This writing couldn’t load</h1><p className="my-6">Please try again in a moment.</p><button className="btn-secondary" type="button" onClick={reset}>Try again</button><p className="mt-6"><Link href="/articles">← All writings</Link></p></div>;
}
