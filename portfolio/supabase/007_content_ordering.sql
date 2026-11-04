-- Apply after 005 (and 006 for a new database). No content is deleted on installation.
-- Every mutation and all affected positions commit together, or roll back together.
begin;
create or replace function public.portfolio_mutate_ordered(
  p_kind text, p_operation text, p_expected jsonb,
  p_values jsonb default '{}'::jsonb, p_id uuid default null,
  p_order uuid[] default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  tbl text;
  snapshot jsonb;
  expected jsonb;
  ids uuid[];
  sorted_ids uuid[];
  requested_ids uuid[];
  entry_id uuid := p_id;
  target integer;
  columns_sql text;
  values_sql text;
  result jsonb;
begin
  if not public.portfolio_is_owner() then
    raise exception 'Owner access required' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('news','projects','articles','books')
    or p_operation is null or p_operation not in ('save','delete','reorder') then
    raise exception 'Invalid content operation';
  end if;
  tbl := 'portfolio_' || p_kind;
  -- Serializes CMS operations and direct table writes in this section.
  execute format('lock table public.%I in share row exclusive mode', tbl);
  execute format('select coalesce(jsonb_agg(jsonb_build_object(''id'',id,''version'',version) order by id),''[]''::jsonb),
    coalesce(array_agg(id order by position,created_at desc,id),array[]::uuid[]) from public.%I',tbl)
    into snapshot, ids;
  if jsonb_typeof(p_expected) is distinct from 'array' then raise exception 'Invalid content snapshot'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'version',s.version) order by s.id),'[]'::jsonb)
    into expected from jsonb_to_recordset(p_expected) as s(id uuid,version integer);
  if snapshot is distinct from expected then
    raise exception 'Content changed in another tab. Reload the dashboard before trying again.' using errcode = '40001';
  end if;
  if p_operation = 'reorder' then
    select coalesce(array_agg(v order by v),array[]::uuid[]) into sorted_ids from unnest(ids) v;
    select coalesce(array_agg(v order by v),array[]::uuid[]) into requested_ids from unnest(p_order) v;
    if p_order is null or sorted_ids is distinct from requested_ids then raise exception 'Invalid entry order'; end if;
    ids := p_order;
  else
    if entry_id is not null and not (entry_id = any(ids)) then raise exception 'Entry no longer exists'; end if;
    if p_operation = 'delete' then
      if entry_id is null then raise exception 'Missing entry'; end if;
      execute format('delete from public.%I where id=$1',tbl) using entry_id;
      ids := array_remove(ids,entry_id);
    else
      if jsonb_typeof(p_values) is distinct from 'object' or not (p_values ? 'title' and p_values ? 'position') then
        raise exception 'Missing content fields';
      end if;
      -- Only content columns may be supplied; IDs, versions and timestamps stay database-owned.
      if exists(select 1 from jsonb_object_keys(p_values) k where
        k in ('id','seed_key','created_at','updated_at','version') or not exists (
          select 1 from pg_catalog.pg_attribute a where a.attrelid=format('public.%I',tbl)::regclass
            and a.attname=k and a.attnum>0 and not a.attisdropped
        )) then raise exception 'Invalid content fields'; end if;
      target := greatest(0,least((p_values->>'position')::integer,cardinality(ids) - case when entry_id is null then 0 else 1 end));
      select string_agg(format('%I',k),',' order by k), string_agg(format('v.%I',k),',' order by k)
        into columns_sql,values_sql from jsonb_object_keys(p_values) k;
      if entry_id is null then
        execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) v returning id',tbl,columns_sql,values_sql,tbl)
          into entry_id using p_values;
      else
        execute format('update public.%I set (%s)=(select %s from jsonb_populate_record(null::public.%I,$1) v) where id=$2',tbl,columns_sql,values_sql,tbl)
          using p_values,entry_id;
        ids := array_remove(ids,entry_id);
      end if;
      ids := coalesce(ids[1:target],array[]::uuid[]) || array[entry_id] || coalesce(ids[target+1:cardinality(ids)],array[]::uuid[]);
    end if;
  end if;
  execute format('update public.%I t set position=(o.n-1)::integer from unnest($1) with ordinality o(id,n)
    where t.id=o.id and t.position is distinct from (o.n-1)::integer',tbl) using ids;
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by position,created_at desc,id),''[]''::jsonb) from public.%I t',tbl) into result;
  return result;
end;
$$;
revoke all on function public.portfolio_mutate_ordered(text,text,jsonb,jsonb,uuid,uuid[]) from public, anon;
grant execute on function public.portfolio_mutate_ordered(text,text,jsonb,jsonb,uuid,uuid[]) to authenticated;
commit;
