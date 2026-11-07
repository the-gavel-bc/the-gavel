create function public.get_admin_homepage_curation() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare version_value integer; saved_lead jsonb; saved_featured jsonb; saved_read jsonb;
  lead_id uuid; featured_ids uuid[]; read_ids uuid[]; used uuid[]; candidate uuid;
  effective_lead jsonb; effective_featured jsonb; effective_read jsonb;
begin
  if not private.is_active_administrator() or not exists(select 1 from public.profiles p
    where p.auth_user_id=auth.uid() and p.active) then
    raise exception 'Administrator access required.' using errcode='42501'; end if;
  select c.edit_version into version_value from public.homepage_curation c
    where c.id='00000000-0000-0000-0000-000000000001'::uuid;
  select pg_catalog.jsonb_build_object('id',a.id,'title',a.title,'status',a.status)
    into saved_lead from public.homepage_selections s join public.articles a on a.id=s.article_id
    where s.group_name='lead' and s.position=1;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',a.id,'title',a.title,'status',a.status) order by s.position),'[]'::jsonb)
    into saved_featured from public.homepage_selections s join public.articles a on a.id=s.article_id where s.group_name='featured';
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',a.id,'title',a.title,'status',a.status) order by s.position),'[]'::jsonb)
    into saved_read from public.homepage_selections s join public.articles a on a.id=s.article_id where s.group_name='read_this';
  select s.article_id into lead_id from public.homepage_selections s join public.articles a on a.id=s.article_id
    where s.group_name='lead' and a.status='published';
  select coalesce(pg_catalog.array_agg(s.article_id order by s.position),'{}'::uuid[]) into featured_ids
    from public.homepage_selections s join public.articles a on a.id=s.article_id
    where s.group_name='featured' and a.status='published';
  select coalesce(pg_catalog.array_agg(s.article_id order by s.position),'{}'::uuid[]) into read_ids
    from public.homepage_selections s join public.articles a on a.id=s.article_id
    where s.group_name='read_this' and a.status='published';
  used:=case when lead_id is null then '{}'::uuid[] else array[lead_id] end || featured_ids || read_ids;
  if lead_id is null then
    select a.id into candidate from public.articles a where a.status='published' and not (a.id=any(used))
      order by a.published_at desc,a.id desc limit 1;
    if candidate is not null then lead_id:=candidate; used:=pg_catalog.array_append(used,candidate); end if;
  end if;
  while pg_catalog.cardinality(featured_ids)<4 loop
    select a.id into candidate from public.articles a where a.status='published' and not (a.id=any(used))
      order by a.published_at desc,a.id desc limit 1;
    exit when candidate is null;
    featured_ids:=pg_catalog.array_append(featured_ids,candidate); used:=pg_catalog.array_append(used,candidate);
  end loop;
  while pg_catalog.cardinality(read_ids)<4 loop
    select a.id into candidate from public.articles a where a.status='published' and not (a.id=any(used))
      order by a.published_at desc,a.id desc limit 1;
    exit when candidate is null;
    read_ids:=pg_catalog.array_append(read_ids,candidate); used:=pg_catalog.array_append(used,candidate);
  end loop;
  select pg_catalog.jsonb_build_object('id',a.id,'title',a.title) into effective_lead
    from public.articles a where a.id=lead_id;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',a.id,'title',a.title) order by t.ordinality),'[]'::jsonb)
    into effective_featured from pg_catalog.unnest(featured_ids) with ordinality t(id,ordinality)
    join public.articles a on a.id=t.id;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',a.id,'title',a.title) order by t.ordinality),'[]'::jsonb)
    into effective_read from pg_catalog.unnest(read_ids) with ordinality t(id,ordinality)
    join public.articles a on a.id=t.id;
  return pg_catalog.jsonb_build_object('version',version_value,
    'saved',pg_catalog.jsonb_build_object('lead',saved_lead,'featured',saved_featured,'readThis',saved_read),
    'effective',pg_catalog.jsonb_build_object('lead',effective_lead,'featured',effective_featured,'readThis',effective_read));
end;
$$;
revoke all on function public.get_admin_homepage_curation() from public,anon,authenticated;
grant execute on function public.get_admin_homepage_curation() to authenticated;
