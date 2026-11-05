import { imageFor, type ArticleRecord } from '../../lib/cms/model';
import RichText, { InlineText } from './RichText';

export default function WritingArticle({ post }: { post: ArticleRecord }) {
  return <article className="writing-article">
    <header className="writing-article-header">
      <h1 className="page-title">{post.title}</h1>
      <p className="writing-article-excerpt">{post.excerpt}</p>
      <p className="article-entry-meta"><time dateTime={post.date_value}>{new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${post.date_value}T00:00:00Z`))}</time><span>{post.reading_minutes} min read · Silas Osunba</span></p>
    </header>
    {imageFor(post) && <img className="writing-article-cover" src={imageFor(post)} alt="" />}
    <div className="writing-article-body">{post.body.blocks.map((block, index) => {
      if (block.type === 'paragraph') return <RichText key={index} body={{ version: 1, blocks: [block] }} />;
      if (block.type === 'heading') { const Heading = block.level === 2 ? 'h2' : 'h3'; return <Heading key={index}>{block.children ? <InlineText spans={block.children} /> : block.text}</Heading>; }
      if (block.type === 'quote') return <blockquote key={index}>{block.children ? <InlineText spans={block.children} /> : block.text}</blockquote>;
      if (block.type === 'list') { const List = block.ordered ? 'ol' : 'ul'; return <List key={index}>{block.items.map((item, i) => <li key={i}>{block.item_spans ? <InlineText spans={block.item_spans[i]} /> : item}</li>)}</List>; }
      return block.image_path ? <figure key={index}><img src={imageFor({ image_path: block.image_path, image_url: '' })} alt={block.alt} loading="lazy" />{block.caption && <figcaption>{block.caption}</figcaption>}</figure> : null;
    })}</div>
  </article>;
}
