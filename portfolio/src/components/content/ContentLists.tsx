import type { ArticleRecord, BookRecord, NewsRecord, ProjectRecord } from '../../lib/cms/model';
import Link from 'next/link';
import { imageFor, safeUrl, writingHref } from '../../lib/cms/model';
import RichText from './RichText';

export function ContentNotice({ label, unavailable = false }: { label: string; unavailable?: boolean }) {
  return <div className="collection-empty" role="status"><h2>{unavailable ? `${label} couldn’t load right now` : `${label} will be here soon`}</h2>{(unavailable || label !== 'Books') && <p>{unavailable ? 'Please try again in a moment.' : 'Check back for new updates.'}</p>}</div>;
}
export function NewsList({ entries }: { entries: NewsRecord[] }) {
  return <ol>{entries.map(entry => <li key={entry.id}><time dateTime={entry.date_value}>{entry.date_label}</time><div className="news-rich-text"><RichText body={entry.body} /></div></li>)}</ol>;
}
export function ProjectList({ entries }: { entries: ProjectRecord[] }) {
  return <div className="project-list">{entries.map(project => <article className="project-entry" key={project.id}>
    <a className="project-entry-image" href={safeUrl(project.link_url)} target="_blank" rel="noopener noreferrer" aria-label={`View ${project.title}`} tabIndex={-1}><img src={imageFor(project)} alt={project.title} loading="lazy" /></a>
    <div className="project-entry-content"><div className="entry-meta"><p className="project-entry-category">{project.categories.join(' · ')}</p>{project.date_label && <span>{project.date_label}</span>}</div>
      <h2><a href={safeUrl(project.link_url)} target="_blank" rel="noopener noreferrer">{project.title} <span aria-hidden="true">↗</span></a></h2>
      <p className="project-entry-author">{project.credit || 'Silas Osunba'}</p><p className="project-entry-description">{project.description}</p>
      <div className="project-entry-links">{project.code_url && <a href={safeUrl(project.code_url)} target="_blank" rel="noopener noreferrer">Code ↗</a>}{project.demo_url && <a href={safeUrl(project.demo_url)} target="_blank" rel="noopener noreferrer">Live project ↗</a>}{!project.code_url && !project.demo_url && <a href={safeUrl(project.link_url)} target="_blank" rel="noopener noreferrer">{project.categories.includes('Civic') ? 'Visit initiative' : 'View project'} ↗</a>}</div>
    </div>
  </article>)}</div>;
}
export function ArticleList({ entries }: { entries: Omit<ArticleRecord, 'body'>[] }) {
  return <div className="article-list">{entries.map(post => {
    const internal = post.publication_type === 'in-app';
    const href = writingHref(post);
    return <article key={post.id} className="article-entry">
      {internal ? <Link className="article-entry-image" href={href} aria-label={`Read ${post.title}`} tabIndex={-1}><img src={imageFor(post)} alt="" loading="lazy" /></Link> : <a className="article-entry-image" href={href} target="_blank" rel="noopener noreferrer" aria-label={`Read ${post.title} on Medium`} tabIndex={-1}><img src={imageFor(post)} alt="" loading="lazy" /></a>}
      <div className="article-entry-content"><div className="article-entry-meta"><time dateTime={post.date_value}>{new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${post.date_value}T00:00:00Z`))}</time><span>{post.reading_minutes} min read</span></div>
        <h2>{internal ? <Link href={href}>{post.title}</Link> : <a href={href} target="_blank" rel="noopener noreferrer">{post.title} <span aria-hidden="true">↗</span></a>}</h2><p>{post.excerpt}</p>
        <div className="writing-read-link">{internal ? <Link href={href}>Read article →</Link> : <a href={href} target="_blank" rel="noopener noreferrer">Read on Medium ↗</a>}</div>
      </div>
    </article>;
  })}</div>;
}
export function BookList({ entries }: { entries: BookRecord[] }) {
  return <div className="grid gap-6 md:grid-cols-2">{entries.map(book => <article key={book.id} className="card-surface p-6">
    {imageFor(book) && <img src={imageFor(book)} alt={`Cover of ${book.title}`} className="mb-5 h-48 max-w-full object-contain" loading="lazy" />}
    <p className="section-kicker">{book.status === 'in-progress' ? 'Reading' : book.status === 'completed' ? 'Completed' : 'Want to read'}</p>
    <h2 className="content-title">{book.title}</h2>{book.author && <p className="mt-2">{book.author}</p>}{book.date_label && <p className="mt-2 text-sm text-muted dark:text-muted-dark">{book.date_label}</p>}
    <p className="my-5 whitespace-pre-line text-sm leading-relaxed">{book.body}</p>{book.url && <a href={safeUrl(book.url)} target="_blank" rel="noopener noreferrer" className="text-link">Read more ↗</a>}
  </article>)}</div>;
}
