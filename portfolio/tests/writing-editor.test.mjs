import test from 'node:test';
import assert from 'node:assert/strict';
import { toWritingEditorDocument, fromWritingEditorDocument } from '../src/lib/cms/writing-editor.ts';
import { compareWritingsNewestFirst, validateWritingBody } from '../src/lib/cms/model.ts';

test('visual editor preserves bold, italic, links, headings, lists, quotes, and uploaded images',()=>{
  const body={version:1,blocks:[
    {type:'paragraph',children:[{text:'Hello ',bold:true},{text:'world',italic:true,href:'https://example.com/'}]},
    {type:'heading',level:2,text:'Heading',children:[{text:'Heading',italic:true}]},
    {type:'list',ordered:true,items:['Item'],item_spans:[[{text:'Item',bold:true}]]},
    {type:'quote',text:'Quote',children:[{text:'Quote',href:'https://example.com/'}]},
    {type:'image',image_path:'00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002.png',alt:'An experiment',caption:'Notes'},
  ]};
  const restored=fromWritingEditorDocument(toWritingEditorDocument(body));
  assert.deepEqual(validateWritingBody(restored,true),body);
});
test('legacy writing bodies remain editable without losing text or images',()=>{
  const body={version:1,blocks:[{type:'heading',level:3,text:'Legacy heading'},{type:'quote',text:'Line 1\nLine 2'},{type:'list',ordered:false,items:['First','Second']} ]};
  const restored=validateWritingBody(fromWritingEditorDocument(toWritingEditorDocument(body)));
  assert.equal(restored.blocks[0].text,'Legacy heading');
  assert.equal(restored.blocks[1].text,'Line 1\nLine 2');
  assert.deepEqual(restored.blocks[2].items,['First','Second']);
});
test('empty editing lines are omitted and unsupported document structures block saving',()=>{
  assert.deepEqual(fromWritingEditorDocument({type:'doc',content:[{type:'paragraph'}]}),{version:1,blocks:[]});
  assert.throws(()=>fromWritingEditorDocument({type:'doc',content:[{type:'html'}]}),/not supported/);
  assert.throws(()=>fromWritingEditorDocument({type:'doc',content:[{type:'bulletList',content:[{type:'listItem',content:[{type:'bulletList'}]}]}]}),/Nested lists/);
  const bad={version:1,blocks:[{type:'heading',level:2,text:'Heading',children:[{text:'Different'}]}]};
  assert.throws(()=>validateWritingBody(bad),/does not match/);
});
test('long editor text is split into safe segments without changing Unicode text',()=>{
  const text='a'.repeat(4999)+'😀'+'b'.repeat(20);
  const body=fromWritingEditorDocument({type:'doc',content:[{type:'paragraph',content:[{type:'text',text,marks:[{type:'bold'}]}]}]});
  assert.equal(body.blocks[0].children.map(span=>span.text).join(''),text);
  assert.ok(body.blocks[0].children.every(span=>span.text.length<=5000 && span.bold));
  validateWritingBody(body,true);
});
test('Writings sort newest first with deterministic same-day ties',()=>{
  const entries=[{id:'old',date_value:'2025-12-31',created_at:'2026-11-04'},{id:'b',date_value:'2026-11-04',created_at:'2026-10-01'},{id:'a',date_value:'2026-11-04',created_at:'2026-10-01'},{id:'recently-created',date_value:'2026-11-04',created_at:'2026-11-04'}];
  assert.deepEqual(entries.sort(compareWritingsNewestFirst).map(entry=>entry.id),['recently-created','a','b','old']);
});
