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
