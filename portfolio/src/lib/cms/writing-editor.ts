import type { JSONContent } from '@tiptap/core';
import type { RichSpan, WritingBlock, WritingBody } from './model';

function plainText(spans: RichSpan[]): string { return spans.map(span => span.text).join(''); }
function toInline(spans: RichSpan[]): JSONContent[] {
  return spans.flatMap(span => {
    const marks = [
      ...(span.bold ? [{ type: 'bold' }] : []),
      ...(span.italic ? [{ type: 'italic' }] : []),
      ...(span.href ? [{ type: 'link', attrs: { href: span.href } }] : []),
    ];
    return span.text.split('\n').flatMap((text, i) => [
      ...(i ? [{ type: 'hardBreak' }] : []),
      ...(text ? [{ type: 'text', text, ...(marks.length ? { marks } : {}) }] : []),
    ]);
  });
}
function fromInline(nodes: JSONContent[] = []): RichSpan[] {
  const spans: RichSpan[] = [];
  for (const node of nodes) {
    if (node.type === 'hardBreak') { spans.push({ text: '\n' }); continue; }
    if (node.type !== 'text') throw new Error('This text formatting is not supported.');
    const format: Omit<RichSpan, 'text'> = {};
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') format.bold = true;
      else if (mark.type === 'italic') format.italic = true;
      else if (mark.type === 'link' && typeof mark.attrs?.href === 'string') format.href = mark.attrs.href;
      else throw new Error('This text formatting is not supported.');
    }
    const text = node.text ?? '';
    for (let start = 0; start < text.length;) {
      let end = Math.min(start + 5000, text.length);
      if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
      spans.push({ text: text.slice(start, end), ...format }); start = end;
    }
  }
  return spans;
}
function fromParagraphs(nodes: JSONContent[] = []): RichSpan[] {
  return nodes.flatMap((node, i) => {
    if (node.type !== 'paragraph') throw new Error('Use simple paragraphs inside lists and quotes. Nested lists are not supported.');
    return [...(i ? [{ text: '\n' }] : []), ...fromInline(node.content)];
  });
}
export function toWritingEditorDocument(body: WritingBody): JSONContent {
  const content: JSONContent[] = body.blocks.map(block => {
    if (block.type === 'paragraph') return { type: 'paragraph', content: toInline(block.children) };
    if (block.type === 'heading') return { type: 'heading', attrs: { level: block.level }, content: toInline(block.children ?? [{ text: block.text }]) };
    if (block.type === 'quote') return { type: 'blockquote', content: [{ type: 'paragraph', content: toInline(block.children ?? [{ text: block.text }]) }] };
    if (block.type === 'list') return { type: block.ordered ? 'orderedList' : 'bulletList', content: block.items.map((text, i) => ({ type: 'listItem', content: [{ type: 'paragraph', content: toInline(block.item_spans?.[i] ?? [{ text }]) }] })) };
    return { type: 'writingImage', attrs: { image_path: block.image_path, alt: block.alt, caption: block.caption } };
  });
  if (content.at(-1)?.type === 'writingImage') content.push({ type: 'paragraph' });
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}
export function fromWritingEditorDocument(doc: JSONContent): WritingBody {
  const blocks: WritingBlock[] = [];
  for (const node of doc.content ?? []) {
    if (node.type === 'paragraph') {
      const children = fromInline(node.content);
      // Enter creates temporary blank paragraphs; layout spacing does not need empty saved blocks.
      if (children.some(span => span.text.trim())) blocks.push({ type: 'paragraph', children });
    } else if (node.type === 'heading') {
      if (node.attrs?.level !== 2 && node.attrs?.level !== 3) throw new Error('Use a section heading or subheading.');
      const children = fromInline(node.content);
      blocks.push({ type: 'heading', level: node.attrs.level, text: plainText(children), children });
    } else if (node.type === 'blockquote') {
      const children = fromParagraphs(node.content);
      blocks.push({ type: 'quote', text: plainText(children), children });
    } else if (node.type === 'bulletList' || node.type === 'orderedList') {
      const item_spans = (node.content ?? []).map(item => fromParagraphs(item.content));
      blocks.push({ type: 'list', ordered: node.type === 'orderedList', items: item_spans.map(plainText), item_spans });
    } else if (node.type === 'writingImage') {
      blocks.push({ type: 'image', image_path: String(node.attrs?.image_path ?? ''), alt: String(node.attrs?.alt ?? ''), caption: String(node.attrs?.caption ?? '') });
    } else throw new Error('This writing element is not supported.');
  }
  return { version: 1, blocks };
}
