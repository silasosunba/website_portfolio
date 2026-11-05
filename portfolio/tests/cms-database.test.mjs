import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const owner = '00000000-0000-4000-8000-000000000001';
const stranger = '00000000-0000-4000-8000-000000000002';
const oldBook = '10000000-0000-4000-8000-000000000001';
const newsBody = JSON.stringify({ version: 1, blocks: [{ type: 'paragraph', children: [{ text: 'Announcement' }] }] });
const readSql = name => readFile(new URL(`../supabase/${name}`, import.meta.url), 'utf8');

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text not null);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant select on storage.objects to anon;
    grant select, insert, update, delete on storage.objects to authenticated;
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
    insert into auth.users values ('${owner}'), ('${stranger}');
  `);
  await db.exec(await readSql('001_content.sql'));
  await db.query('insert into public.portfolio_owner (user_id) values ($1)', [owner]);
  await db.query("insert into public.portfolio_content (id,kind,title,body,author,date,status,published,position) values ($1,'book','Existing book','My existing notes','Author','Oct 2026','completed',true,7)", [oldBook]);
  await db.exec(await readSql('005_portfolio_cms.sql'));
  await db.exec(await readSql('006_initial_content.sql'));
  await db.exec(await readSql('007_content_ordering.sql'));
  await db.exec(await readSql('008_in_app_writings.sql'));
  await db.exec(await readSql('009_visual_writing_formatting.sql'));
  return db;
}
async function asRole(db, role, user, fn) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? '']);
  try { return await fn(); } finally { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', '', false)"); }
}

test('CMS migrations, ownership policies, and private media work in PostgreSQL', async t => {
  const db = await setup();
  try {
    await t.test('existing books preserve IDs, content, status, and publication without a cover', async () => {
      const { rows } = await db.query('select * from portfolio_books where id = $1', [oldBook]);
      assert.equal(rows[0].body, 'My existing notes');
      assert.equal(rows[0].status, 'completed');
      assert.equal(rows[0].published, true);
      assert.equal(rows[0].position, 7);
      for (const [table, count] of [['news', 20], ['projects', 8], ['articles', 1]]) assert.equal((await db.query(`select count(*)::int n from portfolio_${table}`)).rows[0].n, count);
    });
    await t.test('re-running migrations and seeds does not duplicate or overwrite edited content', async () => {
      await db.query("update portfolio_news set title = 'Owner changed title' where seed_key = 'news-condere'");
      await db.exec(await readSql('005_portfolio_cms.sql'));
      await db.exec(await readSql('006_initial_content.sql'));
      assert.equal((await db.query("select title from portfolio_news where seed_key = 'news-condere'")).rows[0].title, 'Owner changed title');
      assert.equal((await db.query('select count(*)::int n from portfolio_news')).rows[0].n, 20);
    });
    await t.test('anonymous and non-owner accounts can only read published content and cannot write', async () => {
      await db.query("insert into portfolio_news (title,date_label,date_value,body,published) values ('Private news','Oct 2026','2026-10',$1,false)", [newsBody]);
      for (const [role, user] of [['anon', null], ['authenticated', stranger]]) {
        await asRole(db, role, user, async () => {
          assert.equal((await db.query("select count(*)::int n from portfolio_news where title = 'Private news'")).rows[0].n, 0);
          assert.equal((await db.query('select count(*)::int n from portfolio_projects')).rows[0].n, 8);
          await assert.rejects(db.query("insert into portfolio_news (title,date_label,date_value,body) values ('Attack','Oct','2026',$1)", [newsBody]));
          await assert.rejects(db.query("insert into portfolio_owner (user_id) values ($1)", [stranger]));
          await assert.rejects(db.query('select * from portfolio_content'));
        });
      }
      await asRole(db, 'authenticated', stranger, async () => {
        assert.equal((await db.query("update portfolio_news set title='Attack' returning id")).rows.length, 0);
        assert.equal((await db.query('delete from portfolio_news returning id')).rows.length, 0);
        assert.equal((await db.query('select * from portfolio_owner')).rows.length, 0);
      });
    });
    await t.test('owner can manage all four content tables; version updates detect stale writes', async () => {
      await asRole(db, 'authenticated', owner, async () => {
        for (const table of ['news','projects','articles','books']) {
          const { rows } = await db.query(`select id,version,title from portfolio_${table} limit 1`);
          assert.ok(rows.length);
          const updated = await db.query(`update portfolio_${table} set title=$1 where id=$2 and version=$3 returning version`, [rows[0].title, rows[0].id, rows[0].version]);
          assert.equal(updated.rows[0].version, rows[0].version + 1);
          assert.equal((await db.query(`update portfolio_${table} set title='Stale' where id=$1 and version=$2 returning id`, [rows[0].id, rows[0].version])).rows.length, 0);
        }
        assert.equal((await db.query("select count(*)::int n from portfolio_news where title='Private news'")).rows[0].n, 1);
        const created = await db.query("insert into portfolio_books (title) values ('Owner draft') returning id");
        assert.equal((await db.query('delete from portfolio_books where id=$1 returning id', [created.rows[0].id])).rows.length, 1);
      });
    });
    await t.test('database itself rejects invalid structured news and non-Medium articles', async () => {
      await asRole(db, 'authenticated', owner, async () => {
        const bad = JSON.stringify({ version: 1, blocks: [{ type: 'paragraph', children: [{ text: 'Click', href: 'javascript:alert(1)' }] }] });
        await assert.rejects(db.query("insert into portfolio_news (title,date_label,date_value,body) values ('Bad','Oct','2026',$1)", [bad]));
        await assert.rejects(db.query("insert into portfolio_articles (title,excerpt,date_value,reading_minutes,url) values ('Bad','Excerpt','2026-10-01',12,'https://medium.com.evil.test/article')"));
      });
    });
    await t.test('private image access follows publication, with owner-only uploads and deletes', async () => {
      const path = `${owner}/20000000-0000-4000-8000-000000000001.png`;
      await asRole(db, 'authenticated', owner, async () => {
        await db.query("insert into storage.objects (bucket_id,name) values ('portfolio-media',$1)", [path]);
        await assert.rejects(db.query("insert into storage.objects (bucket_id,name) values ('portfolio-media',$1)", [`${stranger}/bad.png`]));
        assert.equal((await db.query('select * from storage.objects')).rows.length, 1);
      });
      await asRole(db, 'authenticated', stranger, async () => {
        await assert.rejects(db.query("insert into storage.objects (bucket_id,name) values ('portfolio-media',$1)", [`${stranger}/bad.png`]));
        assert.equal((await db.query('delete from storage.objects returning id')).rows.length, 0);
      });
      const created = await db.query("insert into portfolio_books (title,image_path,published) values ('Private cover',$1,false) returning id", [path]);
      for (const published of [false, true, false]) {
        await db.query('update portfolio_books set published=$1 where id=$2', [published, created.rows[0].id]);
        await asRole(db, 'anon', null, async () => assert.equal((await db.query('select * from storage.objects')).rows.length, published ? 1 : 0));
        await asRole(db, 'authenticated', stranger, async () => assert.equal((await db.query('select * from storage.objects')).rows.length, published ? 1 : 0));
      }
      assert.equal((await db.query("select public from storage.buckets where id='portfolio-media'")).rows[0].public, false);
      await asRole(db, 'authenticated', owner, async () => assert.equal((await db.query('delete from storage.objects returning id')).rows.length, 1));
    });
  } finally { await db.close(); }
});


test('ordered CMS mutations are atomic, owner-only, and detect stale lists', async t => {
  const db = await setup();
  const entries = async kind => (await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by position,created_at desc,id),'[]'::jsonb) as entries from portfolio_${kind} t`)).rows[0].entries;
  const snapshot = rows => rows.map(({ id, version }) => ({ id, version }));
  const mutate = async (kind, operation, rows, values = {}, id = null, order = null) =>
    (await db.query('select public.portfolio_mutate_ordered($1,$2,$3::jsonb,$4::jsonb,$5::uuid,$6::uuid[]) as entries',
      [kind, operation, JSON.stringify(snapshot(rows)), JSON.stringify(values), id, order])).rows[0].entries;
  const contiguous = rows => assert.deepEqual(rows.map(row => row.position), rows.map((_, i) => i));
  try {
    await t.test('migration can be rerun without changing any content', async () => {
      const before = await entries('news');
      await db.exec(await readSql('007_content_ordering.sql'));
      assert.deepEqual(await entries('news'), before);
    });
    await t.test('insertion, edits, reorder, deletion, and appending work in all four sections', async () => {
      await asRole(db, 'authenticated', owner, async () => {
        for (const kind of ['news','projects','articles','books']) {
          const before = await entries(kind);
          const { id: _id, seed_key: _seed, version: _version, created_at: _created, updated_at: _updated, ...values } = before[0];
          const target = Math.min(3, before.length);
          const created = await mutate(kind, 'save', before, { ...values, title: `Inserted ${kind}`, published: false, position: target });
          contiguous(created);
          const inserted = created[target];
          assert.equal(inserted.title, `Inserted ${kind}`);
          assert.equal(inserted.published, false);
          assert.deepEqual(created.filter(row => row.id !== inserted.id).map(row => row.id), before.map(row => row.id));
          assert.equal((await entries(kind)).find(row => row.id === before[0].id).published, before[0].published);
          const edited = await mutate(kind, 'save', created, { ...values, title: 'Edited and moved', position: 0 }, inserted.id);
          contiguous(edited);
          assert.equal(edited[0].id, inserted.id);
          assert.ok(edited[0].version > inserted.version);
          const reversed = await mutate(kind, 'reorder', edited, {}, null, edited.map(row => row.id).reverse());
          contiguous(reversed);
          assert.deepEqual(reversed.map(row => row.id), edited.map(row => row.id).reverse());
          assert.deepEqual(await entries(kind), reversed);
          const unchanged = await mutate(kind, 'reorder', reversed, {}, null, reversed.map(row => row.id));
          assert.deepEqual(unchanged, reversed);
          const deleted = await mutate(kind, 'delete', reversed, {}, inserted.id);
          contiguous(deleted);
          assert.equal(deleted.length, before.length);
          assert.ok(!deleted.some(row => row.id === inserted.id));
          const appended = await mutate(kind, 'save', deleted, { ...values, title: 'Appended', position: 1000000 });
          contiguous(appended);
          assert.equal(appended.at(-1).title, 'Appended');
        }
      });
    });
    await t.test('reorders and saves from stale tabs do not overwrite newer content', async () => {
      await asRole(db, 'authenticated', owner, async () => {
        const stale = await entries('books');
        await db.query('update portfolio_books set title=$1 where id=$2', ['Changed in another tab', stale[0].id]);
        const current = await entries('books');
        for (const operation of ['reorder','delete','save']) {
          await assert.rejects(mutate('books', operation, stale, { title: 'Stale edit', position: 0 }, stale[0].id, stale.map(row => row.id)), /changed in another tab/);
          assert.deepEqual(await entries('books'), current);
        }
      });
    });
    await t.test('invalid permutations, protected columns, and failed constraints roll back the entire operation', async () => {
      await asRole(db, 'authenticated', owner, async () => {
        const before = await entries('books');
        for (const ids of [before.slice(1).map(row => row.id), before.map(() => before[0].id), [...before.map(row => row.id), stranger]]) {
          await assert.rejects(mutate('books', 'reorder', before, {}, null, ids), /Invalid entry order/);
          assert.deepEqual(await entries('books'), before);
        }
        await assert.rejects(mutate('books', 'save', before, { title: 'Bad', position: 0, version: 999 }), /Invalid content fields/);
        await assert.rejects(mutate('books', 'save', before, { title: '', position: 0 }), /check constraint/);
        assert.deepEqual(await entries('books'), before);
      });
    });
    await t.test('anonymous visitors and non-owner accounts cannot invoke ordered mutations', async () => {
      const before = await entries('news');
      for (const [role, user] of [['anon', null], ['authenticated', stranger]]) {
        await asRole(db, role, user, async () => {
          await assert.rejects(mutate('news', 'reorder', before, {}, null, before.map(row => row.id).reverse()), /permission denied|Owner access required/);
        });
        assert.deepEqual(await entries('news'), before);
      }
    });
    await t.test('an empty section supports reorder, first insertion and final deletion', async () => {
      await asRole(db, 'authenticated', owner, async () => {
        await db.query('delete from portfolio_books');
        assert.deepEqual(await mutate('books', 'reorder', [], {}, null, []), []);
        const created = await mutate('books', 'save', [], { title: 'First book', position: 0 });
        assert.equal(created[0].position, 0);
        assert.deepEqual(await mutate('books', 'delete', created, {}, created[0].id), []);
      });
    });
  } finally { await db.close(); }
});


test('dual publishing preserves Medium entries and protects in-app writings and images', async t => {
  const db = await setup();
  const path = `${owner}/30000000-0000-4000-8000-000000000001.png`;
  const body = { version: 1, blocks: [
    { type: 'heading', level: 2, text: 'Research notes' },
    { type: 'paragraph', children: [{ text: 'Read ' }, { text: 'more', href: 'https://example.com', italic: true }] },
    { type: 'list', ordered: false, items: ['One', 'Two'] },
    { type: 'quote', text: 'Build carefully.' },
    { type: 'image', image_path: path, alt: 'An experiment', caption: 'Research in progress' },
  ] };
  let id;
  try {
    await t.test('migration is idempotent and retains the existing Medium article and URL', async () => {
      const before = (await db.query('select * from portfolio_articles')).rows;
      await db.exec(await readSql('008_in_app_writings.sql'));
      assert.deepEqual((await db.query('select * from portfolio_articles')).rows, before);
      assert.equal(before[0].publication_type, 'medium');
      assert.match(before[0].url, /^https:\/\/medium\.com/);
      assert.equal(before[0].slug, null);
    });
    await t.test('owner can save an in-app draft through the atomic CMS mutation', async () => {
      await asRole(db, 'authenticated', owner, async () => {
        await db.query("insert into storage.objects (bucket_id,name) values ('portfolio-media',$1)", [path]);
        const current = (await db.query('select id,version from portfolio_articles')).rows;
        const values = { title: 'My article', published: false, position: 0, image_url: '/images/cover.png', excerpt: 'My research', date_value: '2026-11-04', reading_minutes: 1, publication_type: 'in-app', slug: 'my-article', url: '', body };
        const { rows } = await db.query("select public.portfolio_mutate_ordered('articles','save',$1::jsonb,$2::jsonb) as entries", [JSON.stringify(current), JSON.stringify(values)]);
        id = rows[0].entries.find(row => row.slug === 'my-article').id;
        assert.ok(id);
      });
    });
    await t.test('draft text and body images are invisible to anonymous visitors and non-owners', async () => {
      for (const [role,user] of [['anon',null],['authenticated',stranger]]) await asRole(db, role, user, async () => {
        assert.equal((await db.query("select * from portfolio_articles where slug='my-article'")).rows.length, 0);
        assert.equal((await db.query('select * from storage.objects where name=$1', [path])).rows.length, 0);
      });
      await asRole(db,'authenticated',owner,async () => assert.equal((await db.query('select * from storage.objects where name=$1',[path])).rows.length,1));
    });
    await t.test('publishing, unpublishing, and deleting control access to the article and inline images', async () => {
      for (const published of [true,false,true]) {
        await asRole(db,'authenticated',owner,async () => db.query('update portfolio_articles set published=$1 where id=$2',[published,id]));
        await asRole(db,'anon',null,async () => {
          const rows = (await db.query("select * from portfolio_articles where slug='my-article' and publication_type='in-app' and published")).rows;
          assert.equal(rows.length,published ? 1 : 0);
          if (published) assert.deepEqual(rows[0].body,body);
          assert.equal((await db.query('select * from storage.objects where name=$1',[path])).rows.length,published ? 1 : 0);
        });
      }
      await asRole(db,'authenticated',owner,async () => db.query('delete from portfolio_articles where id=$1',[id]));
      await asRole(db,'anon',null,async () => assert.equal((await db.query('select * from storage.objects where name=$1',[path])).rows.length,0));
    });
    await t.test('database rejects malformed, unsafe, empty published content and duplicate slugs', async () => {
      await asRole(db,'authenticated',owner,async () => {
        const create = (slug, value, published = true) => db.query("insert into portfolio_articles (title,excerpt,date_value,reading_minutes,image_url,url,publication_type,slug,body,published) values ('Article','Excerpt','2026-11-04',1,'/images/cover.png','','in-app',$1,$2::jsonb,$3)",[slug,JSON.stringify(value),published]);
        for (const invalid of [
          { version: 1, blocks: [] },
          { version: 1, blocks: [{ type: 'html', html: '<script />' }] },
          { version: 1, blocks: [{ type: 'paragraph', children: [{ text: 'Bad', href: 'javascript:alert(1)' }] }] },
          { version: 1, blocks: [...body.blocks, { type: 'image', image_path: '../secret.svg', alt: 'Bad', caption: '' }] },
        ]) await assert.rejects(create('invalid',invalid));
        await assert.rejects(create('../bad',body));
        await create('unique-slug',body);
        await assert.rejects(create('unique-slug',body),/unique/);
        // Switching back to Medium must not expose an old private in-app body.
        await assert.rejects(db.query("update portfolio_articles set publication_type='medium',slug=null,url='https://medium.com/@silas/story' where slug='unique-slug'"));
      });
    });
  } finally { await db.close(); }
});


test('visual writing formatting validates, survives storage, and keeps date-first ordering', async t => {
  const db = await setup();
  const body={version:1,blocks:[
    {type:'heading',level:2,text:'A heading',children:[{text:'A heading',bold:true}]},
    {type:'paragraph',children:[{text:'A paragraph',italic:true}]},
    {type:'quote',text:'A quote',children:[{text:'A quote',href:'https://example.com/'}]},
    {type:'list',ordered:false,items:['First item'],item_spans:[[{text:'First ',bold:true},{text:'item',italic:true}]]},
  ]};
  try {
    await t.test('migration is idempotent and formatted text is preserved by atomic saves',async () => {
      await db.exec(await readSql('009_visual_writing_formatting.sql'));
      await asRole(db,'authenticated',owner,async () => {
        const values={title:'Formatted writing',excerpt:'My notes',date_value:'2026-11-04',reading_minutes:1,published:true,position:0,image_url:'/images/cover.png',url:'',publication_type:'in-app',slug:'formatted',body};
        const current=(await db.query('select id,version from portfolio_articles')).rows;
        const saved=(await db.query("select public.portfolio_mutate_ordered('articles','save',$1::jsonb,$2::jsonb) as entries",[JSON.stringify(current),JSON.stringify(values)])).rows[0].entries;
        assert.deepEqual(saved.find(row=>row.slug==='formatted').body,body);
      });
      await db.exec(await readSql('009_visual_writing_formatting.sql'));
      await asRole(db,'anon',null,async () => assert.deepEqual((await db.query("select body from portfolio_articles where slug='formatted'")).rows[0].body,body));
    });
    await t.test('formatting cannot hide unsafe links or disagree with its plain text',async () => {
      await asRole(db,'authenticated',owner,async () => {
        const invalid=structuredClone(body); invalid.blocks[0].children[0].href='javascript:alert(1)';
        await assert.rejects(db.query("update portfolio_articles set body=$1::jsonb where slug='formatted'",[JSON.stringify(invalid)]));
        const mismatch=structuredClone(body); mismatch.blocks[3].item_spans[0][0].text='Different';
        await assert.rejects(db.query("update portfolio_articles set body=$1::jsonb where slug='formatted'",[JSON.stringify(mismatch)]));
      });
    });
    await t.test('publication date takes priority over manual order and creation time',async () => {
      await db.query("update portfolio_articles set position=99,created_at='2020-01-01' where slug='formatted'");
      await db.query("update portfolio_articles set position=0,created_at='2026-11-04' where publication_type='medium'");
      const rows=(await db.query('select slug from portfolio_articles where published order by date_value desc,created_at desc,id')).rows;
      assert.equal(rows[0].slug,'formatted');
    });
  } finally { await db.close(); }
});


test('GitHub username migration updates current CMS content without altering other accounts or Medium',async()=>{
  const db=await setup();
  const legacy='https://github.com/TolaniSilas';
  const updated='https://github.com/silasosunba';
  try{
    const beforeProject=(await db.query("select * from portfolio_projects where seed_key='project-1'")).rows[0];
    const medium=(await db.query("select url from portfolio_articles where publication_type='medium' limit 1")).rows[0].url;
    const newsBody={version:1,blocks:[{type:'paragraph',children:[{text:'QueryMate',href:`${legacy}/Query-Mate?tab=readme#setup`,bold:true}]}]};
    await db.query("update portfolio_news set body=$1::jsonb where seed_key='news-querymate-talk'",[JSON.stringify(newsBody)]);
    await db.query("update portfolio_projects set link_url=$1,code_url=$2,demo_url=$3 where seed_key='project-1'",[`${legacy}/Computer-Vision-Research`,`${legacy.toLowerCase()}/Computer-Vision-Research/tree/main`,`${legacy}Other/demo`]);
    await db.query("insert into portfolio_books (title,body,url,published) values ('GitHub book',$1,$2,false)",[`Read ${legacy}.`,legacy]);
    const writingBody={version:1,blocks:[{type:'paragraph',children:[{text:'My GitHub',href:legacy}]},{type:'heading',level:2,text:legacy,children:[{text:legacy,bold:true}]}]};
    await db.query("insert into portfolio_articles (title,excerpt,date_value,reading_minutes,published,publication_type,slug,url,body) values ('Private writing','Excerpt','2026-11-05',1,false,'in-app','github-update','',$1::jsonb)",[JSON.stringify(writingBody)]);
    await db.exec(await readSql('010_github_username.sql'));
    const project=(await db.query("select * from portfolio_projects where seed_key='project-1'")).rows[0];
    assert.equal(project.link_url,`${updated}/Computer-Vision-Research`);
    assert.equal(project.code_url,`${updated}/Computer-Vision-Research/tree/main`);
    assert.equal(project.demo_url,`${legacy}Other/demo`);
    assert.equal(project.position,beforeProject.position);
    assert.equal(project.published,beforeProject.published);
    assert.equal((await db.query("select body from portfolio_news where seed_key='news-querymate-talk'")).rows[0].body.blocks[0].children[0].href,`${updated}/Query-Mate?tab=readme#setup`);
    const book=(await db.query("select * from portfolio_books where title='GitHub book'")).rows[0];
    assert.equal(book.url,updated);assert.equal(book.body,`Read ${updated}.`);assert.equal(book.published,false);
    const article=(await db.query("select * from portfolio_articles where slug='github-update'")).rows[0];
    assert.equal(article.body.blocks[0].children[0].href,updated);
    assert.equal(article.body.blocks[1].text,updated);
    assert.equal(article.body.blocks[1].children[0].text,updated);
    assert.equal(article.published,false);
    assert.equal((await db.query("select url from portfolio_articles where publication_type='medium' limit 1")).rows[0].url,medium);
    const versions=async()=> (await db.query("select id,version from portfolio_projects union all select id,version from portfolio_news union all select id,version from portfolio_articles union all select id,version from portfolio_books order by id")).rows;
    const current=await versions();
    await db.exec(await readSql('010_github_username.sql'));
    assert.deepEqual(await versions(),current);
  }finally{await db.close();}
});
