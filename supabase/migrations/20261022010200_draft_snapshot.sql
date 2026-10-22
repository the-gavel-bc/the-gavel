create function private.capture_draft_snapshot(p_article_id uuid) returns jsonb
language plpgsql set search_path = '' set timezone = 'UTC' as $$
declare snapshot jsonb; article_fields jsonb; categories jsonb; tags jsonb; credits jsonb;
begin
  select jsonb_build_object(
    'id',a.id,'ownerProfileId',a.owner_profile_id,'sectionId',a.section_id,'title',a.title,'slug',a.slug,
    'excerpt',a.excerpt,'content',a.content,'seoKeyphrase',a.seo_keyphrase,'metaDescription',a.meta_description,
    'status',a.status,'publishedAt',a.published_at,'archivedAt',a.archived_at,
    'createdAt',a.created_at,'updatedAt',a.updated_at,'editVersion',a.edit_version
  ) into article_fields from public.articles a where a.id=p_article_id;
  if not found then return null; end if;
  select coalesce(jsonb_agg(category_id order by category_id),'[]'::jsonb) into categories
    from public.article_categories where article_id=p_article_id;
  select coalesce(jsonb_agg(tag_id order by tag_id),'[]'::jsonb) into tags
    from public.article_tags where article_id=p_article_id;
  select coalesce(jsonb_agg(jsonb_build_object('profileId',profile_id,'role',contribution_role,'displayOrder',display_order)
    order by profile_id,contribution_role::text collate "C"),'[]'::jsonb) into credits
    from public.article_contributors where article_id=p_article_id;
  snapshot := jsonb_build_object('format','gavel-article-snapshot','version',1,'article',article_fields,
    'categoryIds',categories,'tagIds',tags,'contributors',credits);
  if octet_length(snapshot::text) > 2097152 then
    raise exception using errcode='22023',message='Draft snapshot exceeds storage bound';
  end if;
  return snapshot;
end;
$$;
revoke all on function private.capture_draft_snapshot(uuid) from public,anon,authenticated;
