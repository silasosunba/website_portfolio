-- Apply after migrations 008 and 009. Updates existing CMS links; no reseeding.
-- The boundary prevents changing another account such as TolaniSilasOther.
-- JSON bodies are rewritten as JSON so inline links and matching formatted text
-- stay consistent. Only rows containing the old GitHub URL are updated.
begin;
do $$
declare
  target record;
  pattern constant text := 'https://github[.]com/TolaniSilas([^a-zA-Z0-9-]|$)';
  replacement constant text := 'https://github.com/silasosunba\1';
begin
  for target in select * from (values
    ('portfolio_news','title','text'),
    ('portfolio_news','body','jsonb'),
    ('portfolio_projects','title','text'),
    ('portfolio_projects','description','text'),
    ('portfolio_projects','credit','text'),
    ('portfolio_projects','image_url','text'),
    ('portfolio_projects','link_url','text'),
    ('portfolio_projects','code_url','text'),
    ('portfolio_projects','demo_url','text'),
    ('portfolio_articles','title','text'),
    ('portfolio_articles','excerpt','text'),
    ('portfolio_articles','image_url','text'),
    ('portfolio_articles','url','text'),
    ('portfolio_articles','body','jsonb'),
    ('portfolio_books','title','text'),
    ('portfolio_books','author','text'),
    ('portfolio_books','body','text'),
    ('portfolio_books','image_url','text'),
    ('portfolio_books','url','text')
  ) as columns_to_update(table_name,column_name,data_type) loop
    execute format('update public.%I set %I = regexp_replace(%I::text,$1,$2,''gi'')::%s where %I::text ~* $1',
      target.table_name,target.column_name,target.column_name,target.data_type,target.column_name)
      using pattern,replacement;
  end loop;
end;
$$;
commit;
