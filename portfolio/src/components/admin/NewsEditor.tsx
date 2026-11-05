'use client';
import type { NewsBody, RichSpan } from '../../lib/cms/model';

export default function NewsEditor({ value, onChange, label = 'Announcement', singleParagraph = false }: { value: NewsBody; onChange: (value: NewsBody) => void; label?: string; singleParagraph?: boolean }) {
  function spanChange(blockIndex: number, spanIndex: number, patch: Partial<RichSpan>) {
    onChange({ ...value, blocks: value.blocks.map((block, i) => i !== blockIndex ? block : { ...block, children: block.children.map((span, j) => j !== spanIndex ? span : { ...span, ...patch }) }) });
  }
  return <fieldset className="news-editor"><legend>{label}</legend><p className="admin-help">Write in text segments. Add a link to any segment to make those words clickable. Spaces between segments are preserved.</p>
    {value.blocks.map((block, bi) => <div key={bi} className="news-editor-paragraph">
      <div className="admin-toolbar"><h3>Paragraph {bi + 1}</h3>{!singleParagraph && value.blocks.length > 1 && <button type="button" onClick={() => onChange({ ...value, blocks: value.blocks.filter((_, i) => i !== bi) })}>Remove paragraph</button>}</div>
      {block.children.map((span, si) => <div className="news-editor-span" key={si}>
        <label className="admin-field">Text segment {si + 1}<textarea rows={2} value={span.text} onChange={e => spanChange(bi, si, { text: e.target.value })} maxLength={5000} /></label>
        <label className="admin-field">Link for these words (optional)<input type="url" placeholder="https://…" value={span.href ?? ''} onChange={e => {
          const children = block.children.map((child, j) => { if (j !== si) return child; const updated = { ...child }; if (e.target.value) updated.href = e.target.value; else delete updated.href; return updated; });
          onChange({ ...value, blocks: value.blocks.map((item, i) => i === bi ? { ...item, children } : item) });
        }} /></label>
        <div className="admin-toolbar"><label><input type="checkbox" checked={!!span.bold} onChange={e => spanChange(bi, si, { bold: e.target.checked })} /> Bold</label><label><input type="checkbox" checked={!!span.italic} onChange={e => spanChange(bi, si, { italic: e.target.checked })} /> Italic</label>{block.children.length > 1 && <button type="button" onClick={() => onChange({ ...value, blocks: value.blocks.map((item, i) => i === bi ? { ...item, children: item.children.filter((_, j) => j !== si) } : item) })}>Remove segment</button>}</div>
      </div>)}
      <button className="btn-secondary" type="button" disabled={block.children.length >= 100} onClick={() => onChange({ ...value, blocks: value.blocks.map((item, i) => i === bi ? { ...item, children: [...item.children, { text: '' }] } : item) })}>Add text / link segment</button>
    </div>)}
    {!singleParagraph && <button className="btn-secondary" type="button" disabled={value.blocks.length >= 20} onClick={() => onChange({ ...value, blocks: [...value.blocks, { type: 'paragraph', children: [{ text: '' }] }] })}>Add paragraph</button>}
  </fieldset>;
}
