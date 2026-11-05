import { safeUrl } from '../../lib/cms/model';
import type { NewsBody, RichSpan } from '../../lib/cms/model';

export function InlineText({ spans }: { spans: RichSpan[] }) {
  return <>{spans.map((span, i) => {
    let value = <>{span.text}</>;
    if (span.bold) value = <strong>{value}</strong>;
    if (span.italic) value = <em>{value}</em>;
    return span.href && safeUrl(span.href) ? <a key={i} href={safeUrl(span.href)} target="_blank" rel="noopener noreferrer">{value}</a> : <span key={i}>{value}</span>;
  })}</>;
}
export default function RichText({ body }: { body: NewsBody }) {
  return <>{body.blocks.map((block, index) => <p key={index}><InlineText spans={block.children} /></p>)}</>;
}
