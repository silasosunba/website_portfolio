import { getPublicContent } from '../lib/cms/repository';
import { BookList, ContentNotice } from '../components/content/ContentLists';
export default async function CollectionPage() {
  const books = await getPublicContent('books');
  return <div className="books-page page-shell min-h-[65vh]"><header className="books-intro"><h1 className="page-title">Books</h1>
    <div className="mt-5 max-w-2xl text-sm leading-relaxed text-muted dark:text-muted-dark">
      <p>Most of what I know today comes from reading, learning, and thinking about what I’ve learned. Reading makes one stay updated, confident, receptive, and informed, which is why I always nudge people to read.</p>
      <figure className="mt-5 border-l-2 border-line pl-4 dark:border-line-dark">
        <blockquote className="italic">“An informed mind is a living and healthy mind because it cannot be diluted nor tricked by obfuscators.”</blockquote>
        <figcaption className="mt-2 text-xs">— Silas Osunba</figcaption>
      </figure>
    </div>
    </header>
    {books.entries.length ? <BookList entries={books.entries} /> : <ContentNotice label="Books" unavailable={books.unavailable} />}
  </div>;
}
