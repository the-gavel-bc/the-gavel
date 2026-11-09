-- This is the only anonymous article detail entry point. It deliberately
-- returns an allowlist rather than granting access to the underlying rows.
create function public.get_public_article(p_slug text)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  article public.articles%rowtype;
  section jsonb;
  owner jsonb;
  categories jsonb;
  tags jsonb;
  contributors jsonb;
  main_image jsonb;
  body_images jsonb;
begin
  if p_slug is null or char_length(p_slug) not between 1 and 180
    or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    return jsonb_build_object('kind','notFound');
  end if;
  select * into article from public.articles a
    where a.slug = p_slug and a.status = 'published';
  if not found then return jsonb_build_object('kind','notFound'); end if;

  if article.content is null or not private.is_valid_draft_document(article.content) then
    return jsonb_build_object('kind','unavailable');
  end if;
  select jsonb_build_object('id',s.id,'name',s.name,'slug',s.slug)
    into section from public.sections s where s.id=article.section_id and s.active;
  select jsonb_build_object('displayName',p.display_name,'slug',p.slug,'biography',p.biography)
    into owner from public.profiles p where p.id=article.owner_profile_id and p.active;
  if section is null or owner is null then
    return jsonb_build_object('kind','unavailable');
  end if;

  select coalesce(jsonb_agg(x.value order by x.name,x.id),'[]'::jsonb) into categories
    from (select c.id,c.name,jsonb_build_object('id',c.id,'name',c.name,'slug',c.slug) value
      from public.article_categories ac join public.categories c on c.id=ac.category_id
      where ac.article_id=article.id and c.active and c.section_id=article.section_id
      order by c.name,c.id limit 33) x;
  select coalesce(jsonb_agg(x.value order by x.name,x.id),'[]'::jsonb) into tags
    from (select t.id,t.name,jsonb_build_object('id',t.id,'name',t.name,'slug',t.slug) value
      from public.article_tags atg join public.tags t on t.id=atg.tag_id
      where atg.article_id=article.id order by t.name,t.id limit 65) x;
  select coalesce(jsonb_agg(x.value order by x.display_order,x.slug,x.role),'[]'::jsonb) into contributors
    from (select ac.display_order,p.slug,ac.contribution_role::text role,
        jsonb_build_object('displayName',p.display_name,'slug',p.slug,
          'role',ac.contribution_role,'displayOrder',ac.display_order) value
      from public.article_contributors ac join public.profiles p on p.id=ac.profile_id
      where ac.article_id=article.id and p.active
      order by ac.display_order,p.slug,ac.contribution_role limit 33) x;
  if jsonb_array_length(categories)>32 or jsonb_array_length(tags)>64
    or jsonb_array_length(contributors)>32 then
    return jsonb_build_object('kind','unavailable');
  end if;

  -- Never expose a body containing references that cannot be resolved to
  -- finalized assets attached to the current article.
  if exists (
    select 1 from private.body_image_ids(article.content) b
    where not exists (
      select 1 from public.article_body_images abi
      join public.media_assets m on m.id=abi.asset_id and m.article_id=abi.article_id
      where abi.article_id=article.id and abi.asset_id=b.asset_id and m.status='finalized'
    )
  ) then return jsonb_build_object('kind','unavailable'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'width',m.width,'height',m.height) order by m.id),'[]'::jsonb)
    into body_images from private.body_image_ids(article.content) b
    join public.media_assets m on m.id=b.asset_id and m.article_id=article.id and m.status='finalized';

  if exists(select 1 from public.article_main_images ami where ami.article_id=article.id)
    and not exists(select 1 from public.article_main_images ami
      join public.media_assets m on m.id=ami.asset_id and m.article_id=ami.article_id
      where ami.article_id=article.id and m.status='finalized') then
    return jsonb_build_object('kind','unavailable');
  end if;
  select jsonb_build_object('id',m.id,'width',m.width,'height',m.height,'alt',ami.alt_text,'credit',ami.credit)
    into main_image from public.article_main_images ami
    join public.media_assets m on m.id=ami.asset_id and m.article_id=ami.article_id
    where ami.article_id=article.id and m.status='finalized';

  return jsonb_build_object('kind','ok','article',jsonb_build_object(
    'id',article.id,'slug',article.slug,'title',article.title,'excerpt',article.excerpt,
    'metaDescription',article.meta_description,'publishedAt',article.published_at,
    'content',article.content,'section',section,'owner',owner,'categories',categories,
    'tags',tags,'contributors',contributors,'mainImage',main_image,'bodyImages',body_images));
end;
$$;
revoke all on function public.get_public_article(text) from public,anon,authenticated;
grant execute on function public.get_public_article(text) to anon,authenticated;
