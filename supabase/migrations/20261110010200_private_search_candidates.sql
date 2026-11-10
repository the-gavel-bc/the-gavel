-- Private groundwork only. Task 17 must add bounded public parsing, quota and
-- safe card/cursor envelopes before any anonymous search execution is granted.
create function private.search_article_candidates(p_terms text[],p_limit integer default 25,
  p_before_at timestamptz default null,p_before_id uuid default null)
returns table(article_id uuid) language plpgsql stable set search_path='' as $$
begin
  if p_terms is null or array_ndims(p_terms) is distinct from 1 or cardinality(p_terms) not between 1 and 8
    or p_limit is null or p_limit not between 1 and 25
    or ((p_before_at is null)<>(p_before_id is null))
    or exists(select 1 from unnest(p_terms) word where word is null or char_length(word) not between 1 and 120
      or not (word=any(private.search_lexemes(word)))) then
    raise exception 'Invalid private search request.' using errcode='22023';
  end if;
  return query
  with terms as materialized (select distinct word from unnest(p_terms) word),
  hits as (
    select a.id, t.word from terms t join public.articles a on a.status='published'
      and private.article_search_lexemes(a.title,a.excerpt,a.meta_description,a.content) @> array[t.word]
    union
    select a.id, t.word from terms t join public.profiles p on p.active and private.search_lexemes(p.display_name) @> array[t.word]
      join public.articles a on a.owner_profile_id=p.id and a.status='published'
    union
    select ac.article_id, t.word from terms t join public.profiles p on p.active and private.search_lexemes(p.display_name) @> array[t.word]
      join public.article_contributors ac on ac.profile_id=p.id and ac.contribution_role='writer'
    union
    select a.id, t.word from terms t join public.sections s on s.active and private.search_lexemes(s.name) @> array[t.word]
      join public.articles a on a.section_id=s.id and a.status='published'
    union
    select ac.article_id, t.word from terms t join public.categories c on c.active and private.search_lexemes(c.name) @> array[t.word]
      join public.article_categories ac on ac.category_id=c.id and ac.section_id=c.section_id
    union
    select atg.article_id, t.word from terms t join public.tags tag on private.search_lexemes(tag.name) @> array[t.word]
      join public.article_tags atg on atg.tag_id=tag.id
  ), matched as (
    -- UNION removes duplicate source/credit paths; all words may span fields.
    select h.id from hits h group by h.id having count(*)=(select count(*) from terms)
  )
  select a.id from matched m join public.articles a on a.id=m.id and a.status='published'
    join public.sections s on s.id=a.section_id and s.active
    join public.profiles owner on owner.id=a.owner_profile_id and owner.active
  where p_before_at is null or (a.published_at,a.id)<(p_before_at,p_before_id)
  order by a.published_at desc,a.id desc limit p_limit;
end;
$$;
revoke all on function private.search_article_candidates(text[],integer,timestamptz,uuid) from public,anon,authenticated;
