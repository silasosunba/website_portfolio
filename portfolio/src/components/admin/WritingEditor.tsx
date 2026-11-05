'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { Node } from '@tiptap/core';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { FaBold, FaItalic, FaLink, FaUnlink, FaListUl, FaListOl, FaQuoteLeft, FaUndo, FaRedo, FaCloudUploadAlt } from 'react-icons/fa';
import { imageFor, safeUrl, validateWritingBody, type WritingBody } from '../../lib/cms/model';
import { fromWritingEditorDocument, toWritingEditorDocument } from '../../lib/cms/writing-editor';

type Props = { value: WritingBody; disabled: boolean; onChange: (body: WritingBody) => void; onUpload: (file: File) => Promise<string | null>; onError: (message: string) => void };
const imagePath = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp|gif)$/;
const WritingImage = Node.create({
  name: 'writingImage', group: 'block', atom: true, draggable: true,
  addAttributes() {
    return { image_path: { default: '' }, alt: { default: '' }, caption: { default: '' } };
  },
  parseHTML() {
    return [{ tag: 'img[src]', getAttrs: element => {
      const source = element.getAttribute('src') ?? '';
      const path = source.startsWith('/media/') ? source.slice('/media/'.length) : '';
      return imagePath.test(path) ? { image_path: path, alt: element.getAttribute('alt') ?? '', caption: element.closest('figure')?.querySelector('figcaption')?.textContent ?? '' } : false;
    } }];
  },
  renderHTML({ node }) {
    const path = String(node.attrs.image_path ?? '');
    if (!imagePath.test(path)) return ['figure', { 'data-writing-image': '' }, ['span', {}, 'Choose an uploaded image']];
    return ['figure', { 'data-writing-image': '' }, ['img', { src: imageFor({ image_path: path, image_url: '' }), alt: String(node.attrs.alt ?? '') }], ...(node.attrs.caption ? [['figcaption', {}, String(node.attrs.caption)]] : [])];
  },
});

export default function WritingEditor({ value, disabled, onChange, onUpload, onError }: Props) {
  const id = useId();
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState('');
  const [documentError, setDocumentError] = useState('');
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit.configure({
      heading: { levels: [2, 3] }, code: false, codeBlock: false, strike: false,
      underline: false, horizontalRule: false, trailingNode: false,
      link: { openOnClick: false, autolink: false, linkOnPaste: false, isAllowedUri: url => !!safeUrl(url) },
    }), WritingImage],
    content: toWritingEditorDocument(value),
    editorProps: {
      attributes: { class: 'writing-article-body writing-visual-content', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Full writing', 'aria-describedby': `${id}-help` },
      handlePaste: (_view, event) => {
        if (event.clipboardData?.files.length) {
          event.preventDefault(); setLinkError('Use Upload image to add an image file.'); return true;
        }
        return false;
      },
      handleDrop: (_view, event) => {
        if (event.dataTransfer?.files.length) { event.preventDefault(); setLinkError('Use Upload image to add an image file.'); return true; }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      try {
        const body = validateWritingBody(fromWritingEditorDocument(editor.getJSON()));
        onChange(body); onError(''); setDocumentError('');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Check the writing formatting.';
        setDocumentError(message); onError(message);
      }
    },
  });
  const state = useEditorState({ editor, selector: ({ editor }) => editor ? {
    bold: editor.isActive('bold'), italic: editor.isActive('italic'), link: editor.isActive('link'),
    bulletList: editor.isActive('bulletList'), orderedList: editor.isActive('orderedList'), quote: editor.isActive('blockquote'),
    heading: editor.isActive('heading', { level: 2 }) ? 'h2' : editor.isActive('heading', { level: 3 }) ? 'h3' : 'paragraph',
    undo: editor.can().undo(), redo: editor.can().redo(), image: editor.isActive('writingImage'), imageAttrs: editor.getAttributes('writingImage'),
  } : null });
  useEffect(() => { editor?.setEditable(!disabled, false); }, [editor, disabled]);
  const unavailable = disabled || !editor;
  function tool(label: string, icon: ReactNode, action: () => void, active?: boolean, inactive = false) {
    return <button type="button" className="writing-tool" title={label} aria-label={label} aria-pressed={active} disabled={unavailable || inactive} onMouseDown={event => event.preventDefault()} onClick={action}>{icon}</button>;
  }
  function applyLink() {
    const href = safeUrl(linkUrl.trim());
    if (!href) { setLinkError('Enter a complete HTTPS link.'); return; }
    editor?.chain().focus().extendMarkRange('link').setLink({ href }).run();
    setLinkOpen(false); setLinkError('');
  }
  async function insertImage(file: File) {
    if (!editor || disabled) return;
    try {
      const path = await onUpload(file);
      if (!path) return;
      const { $from } = editor.state.selection;
      const position = $from.depth ? $from.after(1) : $from.pos;
      editor.chain().focus().insertContentAt(position, [{ type: 'writingImage', attrs: { image_path: path, alt: '', caption: '' } }, { type: 'paragraph' }]).run();
      editor.state.doc.descendants((node, position) => {
        if (node.type.name === 'writingImage' && node.attrs.image_path === path) editor.commands.setNodeSelection(position);
      });
    } catch { setLinkError('Could not insert the image. Please try again.'); }
  }
  return <fieldset className="writing-editor"><legend>Full writing</legend>
    <p id={`${id}-help`} className="admin-help">Write here and select text to format it. Use Bold / Italic or Ctrl/Cmd+B / Ctrl/Cmd+I. Reading time is calculated automatically. Select an image to edit its description and caption.</p>
    <div className="writing-visual-editor">
      <div className="writing-format-toolbar" role="toolbar" aria-label="Writing formatting">
        <label className="sr-only" htmlFor={`${id}-heading`}>Text style</label>
        <select id={`${id}-heading`} value={state?.heading ?? 'paragraph'} disabled={unavailable} onChange={event => {
          const chain = editor?.chain().focus();
          if (editor?.isActive('blockquote')) chain?.lift('blockquote');
          if (editor?.isActive('listItem')) chain?.liftListItem('listItem');
          if (event.target.value === 'paragraph') chain?.setParagraph().run();
          else chain?.setHeading({ level: event.target.value === 'h2' ? 2 : 3 }).run();
        }}><option value="paragraph">Normal text</option><option value="h2">Heading</option><option value="h3">Subheading</option></select>
        {tool('Bold', <FaBold aria-hidden="true" />, () => { editor?.chain().focus().toggleBold().run(); }, state?.bold)}
        {tool('Italic', <FaItalic aria-hidden="true" />, () => { editor?.chain().focus().toggleItalic().run(); }, state?.italic)}
        {tool('Bullet list', <FaListUl aria-hidden="true" />, () => { const chain = editor?.chain().focus(); if (editor?.isActive('blockquote')) chain?.lift('blockquote'); chain?.toggleBulletList().run(); }, state?.bulletList)}
        {tool('Numbered list', <FaListOl aria-hidden="true" />, () => { const chain = editor?.chain().focus(); if (editor?.isActive('blockquote')) chain?.lift('blockquote'); chain?.toggleOrderedList().run(); }, state?.orderedList)}
        {tool('Quote', <FaQuoteLeft aria-hidden="true" />, () => { const chain = editor?.chain().focus(); if (editor?.isActive('listItem')) chain?.liftListItem('listItem'); chain?.toggleBlockquote().run(); }, state?.quote)}
        {tool('Add or edit link', <FaLink aria-hidden="true" />, () => { setLinkUrl(String(editor?.getAttributes('link').href ?? '')); setLinkOpen(true); setLinkError(''); }, state?.link)}
        {tool('Remove link', <FaUnlink aria-hidden="true" />, () => { editor?.chain().focus().extendMarkRange('link').unsetLink().run(); }, undefined, !state?.link)}
        {tool('Undo', <FaUndo aria-hidden="true" />, () => { editor?.chain().focus().undo().run(); }, undefined, !state?.undo)}
        {tool('Redo', <FaRedo aria-hidden="true" />, () => { editor?.chain().focus().redo().run(); }, undefined, !state?.redo)}
        <label className={`writing-tool writing-upload-tool${unavailable ? ' disabled' : ''}`}><input className="sr-only" type="file" disabled={unavailable} aria-label="Upload writing image" accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void insertImage(file); }} /><FaCloudUploadAlt aria-hidden="true" /><span>Upload image</span></label>
      </div>
      {linkOpen && <div className="writing-link-editor"><label className="admin-field">Link URL<input type="url" value={linkUrl} placeholder="https://…" onChange={event => setLinkUrl(event.target.value)} aria-describedby={linkError ? `${id}-link-error` : undefined} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); applyLink(); } }} /></label><button type="button" className="btn-secondary" disabled={unavailable} onClick={applyLink}>Apply link</button><button type="button" className="btn-secondary" disabled={unavailable} onClick={() => { setLinkOpen(false); setLinkError(''); editor?.commands.focus(); }}>Cancel</button></div>}
      {linkError && <p id={`${id}-link-error`} className="admin-preview-error" role="alert">{linkError}</p>}
      <EditorContent editor={editor} />
      {state?.image && <div className="writing-image-details"><label className="admin-field">Image description (required to publish)<input value={String(state.imageAttrs.alt ?? '')} maxLength={500} onChange={event => editor?.commands.updateAttributes('writingImage', { alt: event.target.value })} /></label><label className="admin-field">Caption (optional)<input value={String(state.imageAttrs.caption ?? '')} maxLength={1000} onChange={event => editor?.commands.updateAttributes('writingImage', { caption: event.target.value })} /></label></div>}
    </div>
    {documentError && <p className="admin-preview-error" role="alert">{documentError} Your text is still in the editor. Fix it or use Undo before saving.</p>}
  </fieldset>;
}
