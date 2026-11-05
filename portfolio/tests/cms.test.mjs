import test from 'node:test';
import assert from 'node:assert/strict';
import { blankNewsBody, blankWritingBody, validateWritingBody, writingReadingMinutes, writingSlug, writingHref, emptyDraft, imageFor, imageType, isContentKind, isUuid, safeUrl, validateContent, validateDate, validateNewsBody } from '../src/lib/cms/model.ts';

const news = () => ({ ...emptyDraft('news'), title: 'Update', date_label: 'Oct 2026', date_value: '2026-10', body: { version: 1, blocks: [{ type: 'paragraph', children: [{ text: 'Read ' }, { text: 'QueryMate', href: 'https://github.com/silasosunba/Query-Mate', bold: true }, { text: ' at Cafe Cursor.' }] }] } });
test('news preserves inline links, formatting, and spaces without accepting HTML nodes', () => {
  const result = validateContent('news', news());
  assert.equal(result.body.blocks[0].children[0].text, 'Read ');
  assert.equal(result.body.blocks[0].children[1].bold, true);
  const invalid = news(); invalid.body.blocks[0].children[0].html = '<script />';
  assert.throws(() => validateContent('news', invalid), /Unsupported/);
});
test('news rejects unsafe link protocols, credential-bearing URLs, and oversized bodies', () => {
  for (const href of ['javascript:alert(1)', 'data:text/html,test', '//evil.test', 'http://example.com', 'https://user:pass@example.com']) {
    const input = news(); input.body.blocks[0].children[1].href = href;
    assert.throws(() => validateContent('news', input));
  }
  assert.throws(() => validateNewsBody(blankNewsBody()), /needs some text/);
  assert.throws(() => validateNewsBody({ version: 1, blocks: Array(21).fill({ type: 'paragraph', children: [{ text: 'Hi' }] }) }));
});
test('calendar validation supports precise and partial dates without silently rolling over invalid days', () => {
  for (const date of ['2026', '2026-10', '2024-02-29']) assert.equal(validateDate(date), date);
  for (const date of ['2026-02-29', '2026-13', 'Oct 2026', '2026-04-31']) assert.throws(() => validateDate(date));
  assert.throws(() => validateDate('2026-10', true, true));
});
test('content save allowlists fields and excludes client-controlled identity/version metadata', () => {
  const result = validateContent('news', { ...news(), id: 'spoof', version: 500, created_at: 'spoof', seed_key: 'spoof', role: 'admin' });
  for (const key of ['id', 'version', 'created_at', 'seed_key', 'role']) assert.equal(key in result, false);
  assert.throws(() => validateContent('news', { ...news(), position: 1.3 }));
  assert.throws(() => validateContent('news', { ...news(), published: 'true' }));
});
test('article listings require Medium URLs and a positive integer reading time', () => {
  const article = { ...emptyDraft('articles'), title: 'LLMs', excerpt: 'An introduction', date_value: '2024-08-20', url: 'https://medium.com/@silas/article' };
  assert.equal(validateContent('articles', article).reading_minutes, 12);
  for (const url of ['https://medium.com.evil.test/article', 'https://example.com', 'javascript:alert(1)']) assert.throws(() => validateContent('articles', { ...article, url }));
  for (const reading_minutes of [0, -1, 1.5, 301]) assert.throws(() => validateContent('articles', { ...article, reading_minutes }));
});
test('projects enforce valid categories and require a cover before publishing', () => {
  const project = { ...emptyDraft('projects'), title: 'Project', description: 'Details', link_url: 'https://github.com/silas/project' };
  assert.equal(validateContent('projects', project).published, false);
  assert.throws(() => validateContent('projects', { ...project, categories: ['Unknown'] }));
  assert.throws(() => validateContent('projects', { ...project, published: true }), /image/);
  assert.equal(validateContent('projects', { ...project, published: true, image_url: '/images/cv-image.png' }).published, true);
});
test('legacy books can remain published without a cover and validate reading states', () => {
  const book = { ...emptyDraft('books'), title: 'A book', published: true };
  assert.equal(validateContent('books', book).published, true);
  assert.throws(() => validateContent('books', { ...book, status: 'private' }));
});
test('uploaded media paths cannot escape the private image route', () => {
  const path = '00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002.png';
  assert.equal(imageFor({ image_path: path, image_url: '' }), `/media/${path}`);
  assert.throws(() => validateContent('books', { ...emptyDraft('books'), title: 'Book', image_path: '../secret.svg' }));
  assert.equal(safeUrl('//evil.test/image.png', true), '');
  assert.equal(isContentKind('owners'), false);
  assert.equal(isUuid('1 or true'), false);
});
test('upload MIME detection uses bytes and excludes SVG/HTML', () => {
  assert.deepEqual(imageType(new Uint8Array([137,80,78,71,13,10,26,10])), { mime: 'image/png', extension: 'png' });
  assert.equal(imageType(new TextEncoder().encode('<svg onload="alert(1)">')), null);
  assert.equal(imageType(new TextEncoder().encode('<html>')), null);
});


test('in-app writings generate stable URLs, calculate reading time, and accept safe structured content', () => {
  const body = { version: 1, blocks: [
    { type: 'heading', level: 2, text: 'A section' },
    { type: 'paragraph', children: [{ text: 'word '.repeat(400) }, { text: 'linked text', href: 'https://example.com/', bold: true }] },
    { type: 'quote', text: 'A quote' },
    { type: 'list', ordered: true, items: ['First item', 'Second item'] },
  ] };
  const input = { ...emptyDraft('articles'), title: 'Trustworthy AI: My Journey', publication_type: 'in-app', excerpt: 'My story', date_value: '2026-11-04', body, published: true, image_url: '/images/cover.png' };
  const result = validateContent('articles', input);
  assert.equal(result.slug,'trustworthy-ai-my-journey');
  assert.equal(result.url,'');
  assert.equal(result.reading_minutes,3);
  assert.equal(writingHref(result),'/articles/trustworthy-ai-my-journey');
  assert.deepEqual(result.body,body);
  assert.equal(validateContent('articles',{...input,slug:'my-stable-url',title:'New title'}).slug,'my-stable-url');
  assert.equal(writingSlug('  Café & AI!  '),'cafe-ai');
});
test('in-app draft bodies can be empty but published articles need text, valid images, and safe URLs', () => {
  assert.deepEqual(validateWritingBody(blankWritingBody()),blankWritingBody());
  assert.throws(() => validateWritingBody(blankWritingBody(),true),/paragraph/);
  for (const block of [
    { type: 'html', html: '<script />' },
    { type: 'heading',level:1,text:'Bad' },
    { type: 'paragraph',children:[{text:'Bad',html:'<b>Bad</b>'}] },
    { type: 'paragraph',children:[{text:'Bad',href:'javascript:alert(1)'}] },
    { type: 'paragraph',children:[{text:'Bad',href:'https://user:pass@example.com'}] },
    { type: 'image',image_path:'../private.svg',alt:'Bad',caption:'' },
  ]) assert.throws(() => validateWritingBody({version:1,blocks:[block]}));
  const paragraph = {type:'paragraph',children:[{text:'Safe text'}]};
  assert.throws(() => validateWritingBody({version:1,blocks:[paragraph,{type:'image',image_path:'',alt:'',caption:''}]},true),/Upload/);
  assert.throws(() => validateWritingBody({version:1,blocks:Array(101).fill(paragraph)}));
  assert.equal(writingReadingMinutes(blankWritingBody()),1);
  const input={...emptyDraft('articles'),title:'Title',publication_type:'in-app',excerpt:'Excerpt',date_value:'2026-11-04'};
  for (const slug of ['../private','UPPER','two--hyphens','a'.repeat(101)]) assert.throws(() => validateContent('articles',{...input,slug}));
});
test('Medium entries keep external links and discard in-app body and slug when switching modes', () => {
  const result=validateContent('articles',{...emptyDraft('articles'),title:'Medium',excerpt:'Excerpt',date_value:'2026-11-04',url:'https://medium.com/@silas/story',slug:'private-draft',body:{version:1,blocks:[{type:'paragraph',children:[{text:'Private content'}]}]}});
  assert.equal(writingHref(result),'https://medium.com/@silas/story');
  assert.equal(result.slug,null);
  assert.deepEqual(result.body,blankWritingBody());
});
