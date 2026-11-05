-- Apply after 008. Existing writing bodies remain valid and are not rewritten.
begin;
create or replace function public.portfolio_valid_writing_body_v1(doc jsonb, require_content boolean default false)
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
create or replace function public.portfolio_valid_writing_spans(spans jsonb, expected_text text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare s jsonb; combined text := '';
begin
  if jsonb_typeof(spans) is distinct from 'array' or jsonb_array_length(spans) > 100 or expected_text is null then return false; end if;
  for s in select * from jsonb_array_elements(spans) loop
    if jsonb_typeof(s) is distinct from 'object' or jsonb_typeof(s->'text') is distinct from 'string' or length(s->>'text') > 5000 then return false; end if;
    if exists(select 1 from jsonb_object_keys(s) k where k not in ('text','href','bold','italic')) then return false; end if;
    if s ? 'href' and (jsonb_typeof(s->'href') <> 'string' or s->>'href' !~ '^https://[^[:space:]@/]+([/?#][^[:space:]]*)?$' or length(s->>'href') > 2048) then return false; end if;
    if s ? 'bold' and jsonb_typeof(s->'bold') <> 'boolean' then return false; end if;
    if s ? 'italic' and jsonb_typeof(s->'italic') <> 'boolean' then return false; end if;
    combined := combined || (s->>'text');
  end loop;
  return combined = expected_text;
exception when others then return false;
end;
$$;
create or replace function public.portfolio_valid_writing_body(doc jsonb, require_content boolean default false)
returns boolean language plpgsql immutable set search_path = '' as $$
declare b jsonb; plain_blocks jsonb := '[]'::jsonb; i integer;
begin
  if jsonb_typeof(doc->'version') is distinct from 'number' or jsonb_typeof(doc->'blocks') is distinct from 'array'
    or jsonb_array_length(doc->'blocks') > 100 or octet_length(doc::text) > 512000 then return false; end if;
  for b in select * from jsonb_array_elements(doc->'blocks') loop
    if b->>'type' in ('heading','quote') and b ? 'children' then
      if public.portfolio_valid_writing_spans(b->'children', b->>'text') is distinct from true then return false; end if;
      b := b - 'children';
    elsif b->>'type' = 'list' and b ? 'item_spans' then
      if jsonb_typeof(b->'items') is distinct from 'array' or jsonb_typeof(b->'item_spans') is distinct from 'array'
        or jsonb_array_length(b->'items') <> jsonb_array_length(b->'item_spans') then return false; end if;
      for i in 0..jsonb_array_length(b->'items')-1 loop
        if public.portfolio_valid_writing_spans(b->'item_spans'->i,b->'items'->>i) is distinct from true then return false; end if;
      end loop;
      b := b - 'item_spans';
    end if;
    plain_blocks := plain_blocks || jsonb_build_array(b);
  end loop;
  return public.portfolio_valid_writing_body_v1(jsonb_set(doc,'{blocks}',plain_blocks),require_content);
exception when others then return false;
end;
$$;
notify pgrst, 'reload schema';
commit;
