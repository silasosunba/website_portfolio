import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const owner = '00000000-0000-4000-8000-000000000001';
const stranger = '00000000-0000-4000-8000-000000000002';
const paths = [1, 2, 3, 4].map(n => `${owner}/10000000-0000-4000-8000-${String(n).padStart(12, '0')}.pdf`);
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
  await db.exec(await readSql('005_portfolio_cms.sql'));
  await db.query('insert into public.portfolio_owner (user_id) values ($1)', [owner]);
  await db.exec(await readSql('011_portfolio_documents.sql'));
  return db;
}
async function asRole(db, role, user, operation) {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? '']);
  try { return await operation(); }
  finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}
const upload = (db, path) => db.query("insert into storage.objects (bucket_id,name) values ('portfolio-documents',$1)", [path]);
const publish = async (db, kind, path, expected = 0, name = 'Document.pdf', size = 1024) =>
  (await db.query('select public.portfolio_publish_document($1,$2,$3,$4,$5) as document', [kind, path, name, size, expected])).rows[0].document;
const documents = async db => (await db.query('select * from portfolio_documents order by kind')).rows;
const visibleObjects = async db => (await db.query("select name from storage.objects where bucket_id='portfolio-documents' order by name")).rows.map(row => row.name);

test('portfolio PDF migration protects uploads and current public documents', async t => {
  const db = await setup();
  try {
    await t.test('bucket is private, PDF-only, limited to five MiB, with no forced document seed', async () => {
      const bucket = (await db.query("select * from storage.buckets where id='portfolio-documents'")).rows[0];
      assert.equal(bucket.public, false);
      assert.equal(Number(bucket.file_size_limit), 5242880);
      assert.deepEqual(bucket.allowed_mime_types, ['application/pdf']);
      assert.deepEqual(await documents(db), []);
    });
    await t.test('only the owner can upload PDFs to their own UUID folder', async () => {
      for (const [role, user, path] of [['anon', null, paths[0]], ['authenticated', stranger, paths[0]], ['authenticated', stranger, `${stranger}/10000000-0000-4000-8000-000000000001.pdf`]]) {
        await asRole(db, role, user, () => assert.rejects(upload(db, path)));
      }
      await asRole(db, 'authenticated', owner, async () => {
        await upload(db, paths[0]);
        await upload(db, paths[1]);
        await assert.rejects(upload(db, `${stranger}/10000000-0000-4000-8000-000000000001.pdf`));
        await assert.rejects(upload(db, paths[0].replace('.pdf', '.html')));
        assert.deepEqual(await visibleObjects(db), paths.slice(0, 2));
        assert.equal((await db.query("update storage.objects set name='overwritten.pdf' where name=$1 returning id", [paths[0]])).rows.length, 0);
      });
      for (const [role, user] of [['anon', null], ['authenticated', stranger]]) {
        await asRole(db, role, user, async () => assert.deepEqual(await visibleObjects(db), []));
      }
    });
    await t.test('publication requires owner RPC access, an uploaded file, and valid metadata', async () => {
      for (const [role, user] of [['anon', null], ['authenticated', stranger]]) {
        await asRole(db, role, user, () => assert.rejects(publish(db, 'resume', paths[0]), /permission denied|Owner access required/));
      }
      for (const user of [owner, stranger]) {
        await asRole(db, 'authenticated', user, () => assert.rejects(db.query("insert into portfolio_documents (kind,storage_path,original_name,size_bytes) values ('resume',$1,'Document.pdf',1024)", [paths[0]]), /permission denied/));
      }
      await asRole(db, 'authenticated', owner, async () => {
        await assert.rejects(publish(db, 'resume', paths[3]), /Upload the PDF before/);
        await assert.rejects(publish(db, 'other', paths[0]), /Invalid document/);
        await assert.rejects(publish(db, 'resume', `${stranger}/10000000-0000-4000-8000-000000000001.pdf`), /own document folder/);
        await assert.rejects(publish(db, 'resume', paths[0], 0, 'Document.html'), /check constraint/);
        await assert.rejects(publish(db, 'resume', paths[0], 0, 'Bad\nName.pdf'), /check constraint/);
        await assert.rejects(publish(db, 'resume', paths[0], 0, 'Document.pdf', 5242881), /check constraint/);
        assert.deepEqual(await documents(db), []);
        const saved = await publish(db, 'resume', paths[0]);
        assert.equal(saved.kind, 'resume');
        assert.equal(saved.storage_path, paths[0]);
        assert.equal(saved.version, 1);
        assert.equal(saved.size_bytes, 1024);
        assert.equal(typeof saved.updated_at, 'string');
      });
    });
    await t.test('anonymous visitors see only the current uploaded PDF and its metadata', async () => {
      for (const [role, user] of [['anon', null], ['authenticated', stranger]]) {
        await asRole(db, role, user, async () => {
          assert.deepEqual(await visibleObjects(db), [paths[0]]);
          assert.equal((await documents(db))[0].storage_path, paths[0]);
        });
      }
      await asRole(db, 'authenticated', stranger, async () => {
        await assert.rejects(db.query("update portfolio_documents set original_name='Attack.pdf'"), /permission denied/);
        await assert.rejects(db.query('delete from portfolio_documents'), /permission denied/);
        assert.equal((await db.query("delete from storage.objects where name=$1 returning id", [paths[0]])).rows.length, 0);
      });
    });
    await t.test('replacement is versioned and stale tabs cannot replace the current document', async () => {
      await asRole(db, 'authenticated', owner, async () => {
        const before = await documents(db);
        await assert.rejects(publish(db, 'resume', paths[1], 0), error => error.code === '40001');
        assert.deepEqual(await documents(db), before);
        const saved = await publish(db, 'resume', paths[1], 1, 'New Resume.pdf');
        assert.equal(saved.version, 2);
        assert.equal(saved.storage_path, paths[1]);
        await assert.rejects(publish(db, 'resume', paths[0], 1), error => error.code === '40001');
      });
      await asRole(db, 'anon', null, async () => assert.deepEqual(await visibleObjects(db), [paths[1]]));
    });
    await t.test('cleanup can delete unused uploads but cannot delete the current public PDF', async () => {
      await asRole(db, 'authenticated', owner, async () => {
        assert.equal((await db.query("delete from storage.objects where name=$1 returning id", [paths[1]])).rows.length, 0);
        assert.equal((await db.query("delete from storage.objects where name=$1 returning id", [paths[0]])).rows.length, 1);
        await upload(db, paths[2]);
        const cv = await publish(db, 'cv', paths[2], 0, 'Academic CV.pdf');
        assert.equal(cv.version, 1);
        assert.equal((await documents(db)).find(row => row.kind === 'resume').version, 2);
      });
      await asRole(db, 'anon', null, async () => assert.deepEqual(await visibleObjects(db), [paths[1], paths[2]]));
    });
    await t.test('reapplying the migration preserves versions, metadata, and access rules', async () => {
      const before = await documents(db);
      await db.exec(await readSql('011_portfolio_documents.sql'));
      assert.deepEqual(await documents(db), before);
      await asRole(db, 'anon', null, async () => assert.deepEqual(await visibleObjects(db), [paths[1], paths[2]]));
      await asRole(db, 'authenticated', owner, () => assert.rejects(db.query("update portfolio_documents set version=999"), /permission denied/));
    });
  } finally { await db.close(); }
});
