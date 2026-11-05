-- Apply after 005_portfolio_cms.sql. Upload files through Storage's API, never SQL.
-- Existing repository PDFs remain the fallback until the owner publishes a replacement.
begin;

create table if not exists public.portfolio_documents (
  kind text primary key check (kind in ('resume', 'cv')),
  storage_path text not null unique check (
    storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
  ),
  original_name text not null check (
    length(trim(original_name)) between 1 and 200
    and original_name ~* '\.pdf$'
    and original_name !~ '[[:cntrl:]/\\]'
  ),
  size_bytes bigint not null check (size_bytes between 5 and 5242880),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1)
);
alter table public.portfolio_documents enable row level security;
revoke all on public.portfolio_documents from public, anon, authenticated;
grant select on public.portfolio_documents to anon, authenticated;
drop policy if exists "Portfolio current document metadata" on public.portfolio_documents;
create policy "Portfolio current document metadata" on public.portfolio_documents
for select to anon, authenticated using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portfolio-documents', 'portfolio-documents', false, 5242880, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- New uploads are private until a current document row references their object path.
drop policy if exists "Portfolio current PDFs or owner reads" on storage.objects;
create policy "Portfolio current PDFs or owner reads" on storage.objects
for select to anon, authenticated using (
  bucket_id = 'portfolio-documents' and (
    ((select public.portfolio_is_owner()) and (storage.foldername(name))[1] = (select auth.uid())::text)
    or exists (select 1 from public.portfolio_documents d where d.storage_path = storage.objects.name)
  )
);
drop policy if exists "Portfolio owner uploads PDFs" on storage.objects;
create policy "Portfolio owner uploads PDFs" on storage.objects
for insert to authenticated with check (
  bucket_id = 'portfolio-documents'
  and (select public.portfolio_is_owner())
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
);
-- No UPDATE policy: each replacement is a new object, so cached/active files are never overwritten.
drop policy if exists "Portfolio owner removes unused PDFs" on storage.objects;
create policy "Portfolio owner removes unused PDFs" on storage.objects
for delete to authenticated using (
  bucket_id = 'portfolio-documents'
  and (select public.portfolio_is_owner())
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (select 1 from public.portfolio_documents d where d.storage_path = storage.objects.name)
);

create or replace function public.portfolio_publish_document(
  p_kind text,
  p_storage_path text,
  p_original_name text,
  p_size_bytes bigint,
  p_expected_version integer
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  current_document public.portfolio_documents%rowtype;
  saved_document public.portfolio_documents%rowtype;
begin
  if not public.portfolio_is_owner() then
    raise exception using errcode = '42501', message = 'Owner access required.';
  end if;
  if p_kind is null or p_kind not in ('resume', 'cv')
    or p_expected_version is null or p_expected_version < 0 then
    raise exception using errcode = '22023', message = 'Invalid document selection or version.';
  end if;
  if p_storage_path is null or split_part(p_storage_path, '/', 1) is distinct from auth.uid()::text then
    raise exception using errcode = '42501', message = 'Upload the PDF to your own document folder.';
  end if;

  -- Serialize the two current-document pointers and reject stale admin tabs.
  lock table public.portfolio_documents in share row exclusive mode;
  select * into current_document from public.portfolio_documents where kind = p_kind;
  if (current_document.kind is null and p_expected_version <> 0)
    or (current_document.kind is not null and current_document.version <> p_expected_version) then
    raise exception using errcode = '40001', message = 'This document changed in another tab. Reload before replacing it.';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'portfolio-documents' and name = p_storage_path) then
    raise exception using errcode = '22023', message = 'Upload the PDF before publishing it.';
  end if;

  insert into public.portfolio_documents (kind, storage_path, original_name, size_bytes)
  values (p_kind, p_storage_path, p_original_name, p_size_bytes)
  on conflict (kind) do update set
    storage_path = excluded.storage_path,
    original_name = excluded.original_name,
    size_bytes = excluded.size_bytes,
    updated_at = now(),
    version = public.portfolio_documents.version + 1
  returning * into saved_document;
  return to_jsonb(saved_document);
end;
$$;
revoke all on function public.portfolio_publish_document(text, text, text, bigint, integer) from public, anon;
grant execute on function public.portfolio_publish_document(text, text, text, bigint, integer) to authenticated;
commit;
