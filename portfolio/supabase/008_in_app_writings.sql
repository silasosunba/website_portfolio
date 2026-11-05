-- Apply after 005, 006 (new databases only), and 007.
-- Existing entries remain Medium writings; no content is deleted.
begin;
create or replace function public.portfolio_valid_writing_body(doc jsonb, require_content boolean default false)
returns boolean language plpgsql immutable set search_path = '' as $$
declare b jsonb; s jsonb; item jsonb; paragraph_text text; total integer := 0; has_paragraph boolean := false;
begin
  if doc->>'version' is distinct from '1' or jsonb_typeof(doc->'blocks') is distinct from 'array'
    or jsonb_array_length(doc->'blocks') > 100 or octet_length(doc::text) > 512000 then return false; end if;
  for b in select * from jsonb_array_elements(doc->'blocks') loop
    case b->>'type'
    when 'paragraph' then
      if jsonb_typeof(b->'children') is distinct from 'array' or jsonb_array_length(b->'children') not between 1 and 100 then return false; end if;
      paragraph_text := '';
      for s in select * from jsonb_array_elements(b->'children') loop
        if jsonb_typeof(s) is distinct from 'object' or jsonb_typeof(s->'text') is distinct from 'string' or length(s->>'text') > 5000 then return false; end if;
        if exists(select 1 from jsonb_object_keys(s) k where k not in ('text','href','bold','italic')) then return false; end if;
        if s ? 'href' and (jsonb_typeof(s->'href') <> 'string' or s->>'href' !~ '^https://[^[:space:]@/]+([/?#][^[:space:]]*)?$' or length(s->>'href') > 2048) then return false; end if;
        if s ? 'bold' and jsonb_typeof(s->'bold') <> 'boolean' then return false; end if;
        if s ? 'italic' and jsonb_typeof(s->'italic') <> 'boolean' then return false; end if;
        paragraph_text := paragraph_text || (s->>'text');
      end loop;
      if require_content and length(trim(paragraph_text)) = 0 then return false; end if;
      has_paragraph := has_paragraph or length(trim(paragraph_text)) > 0;
      total := total + length(paragraph_text);
    when 'heading', 'quote' then
      if jsonb_typeof(b->'text') is distinct from 'string' then return false; end if;
      if b->>'type' = 'heading' and (b->>'level' not in ('2','3') or jsonb_typeof(b->'level') is distinct from 'number' or length(b->>'text') > 300) then return false; end if;
      if length(b->>'text') > 20000 or (require_content and length(trim(b->>'text')) = 0) then return false; end if;
      total := total + length(b->>'text');
    when 'list' then
      if jsonb_typeof(b->'ordered') is distinct from 'boolean' or jsonb_typeof(b->'items') is distinct from 'array'
        or jsonb_array_length(b->'items') not between 1 and 100 then return false; end if;
      for item in select * from jsonb_array_elements(b->'items') loop
        if jsonb_typeof(item) <> 'string' or length(item #>> '{}') > 5000 or (require_content and length(trim(item #>> '{}')) = 0) then return false; end if;
        total := total + length(item #>> '{}');
      end loop;
    when 'image' then
      if jsonb_typeof(b->'image_path') is distinct from 'string' or jsonb_typeof(b->'alt') is distinct from 'string'
        or jsonb_typeof(b->'caption') is distinct from 'string' then return false; end if;
      if (b->>'image_path' <> '' and b->>'image_path' !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp|gif)$')
        or (require_content and (b->>'image_path' = '' or length(trim(b->>'alt')) = 0))
        or length(b->>'alt') > 500 or length(b->>'caption') > 1000 then return false; end if;
      total := total + length(b->>'alt') + length(b->>'caption');
    else return false;
    end case;
  end loop;
  return total <= 100000 and (not require_content or has_paragraph);
exception when others then return false;
end;
$$;
alter table public.portfolio_articles
  add column if not exists publication_type text not null default 'medium',
  add column if not exists slug text,
  add column if not exists body jsonb not null default '{"version":1,"blocks":[]}'::jsonb;
alter table public.portfolio_articles drop constraint if exists portfolio_articles_url_check;
alter table public.portfolio_articles drop constraint if exists portfolio_articles_destination_check;
alter table public.portfolio_articles drop constraint if exists portfolio_articles_body_check;
alter table public.portfolio_articles add constraint portfolio_articles_destination_check check (
  (publication_type = 'medium' and url ~ '^https://([a-zA-Z0-9-]+\.)*medium\.com(/|$)' and slug is null and body = '{"version":1,"blocks":[]}'::jsonb)
  or (publication_type = 'in-app' and url = '' and slug is not null and length(slug) between 1 and 100 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
alter table public.portfolio_articles add constraint portfolio_articles_body_check
  check (public.portfolio_valid_writing_body(body, published and publication_type = 'in-app'));
create unique index if not exists portfolio_articles_slug_unique on public.portfolio_articles (slug) where slug is not null;

-- Body images use the same private bucket as covers. Only published in-app
-- articles make their referenced images public; unpublishing revokes access.
drop policy if exists "Portfolio published images or owner" on storage.objects;
create policy "Portfolio published images or owner" on storage.objects for select to anon, authenticated using (
  bucket_id = 'portfolio-media' and (
    ((select public.portfolio_is_owner()) and (storage.foldername(name))[1] = (select auth.uid())::text)
    or exists (select 1 from public.portfolio_projects where image_path = storage.objects.name and published)
    or exists (select 1 from public.portfolio_articles where published and (
      image_path = storage.objects.name or (publication_type = 'in-app' and body @> jsonb_build_object('blocks',jsonb_build_array(jsonb_build_object('type','image','image_path',storage.objects.name))))
    ))
    or exists (select 1 from public.portfolio_books where image_path = storage.objects.name and published)
  )
);
notify pgrst, 'reload schema';
commit;
