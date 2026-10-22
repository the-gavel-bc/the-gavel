create function public.create_article_draft(p_request_id uuid,p_draft jsonb) returns jsonb
language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare
  actor uuid := auth.uid(); owner_id uuid; checked jsonb; draft jsonb; fingerprint bytea;
  receipt private.draft_write_receipts%rowtype; article_id uuid; committed_at timestamptz; failed_constraint text;
begin
  owner_id := private.lock_draft_actor();
  if owner_id is null then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  checked := private.check_draft_input(p_draft);
  select * into receipt from private.draft_write_receipts where actor_user_id=actor and request_id=p_request_id;
  if checked ->> 'ok' = 'true' then
    draft := checked -> 'value';
    fingerprint := private.draft_request_hash('create',null,null,draft);
    if receipt.request_id is not null and receipt.operation='create' and receipt.payload_hash=fingerprint then
      if not private.can_read_article(receipt.article_id) then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
      return jsonb_build_object('ok',true,'articleId',receipt.article_id,'version',receipt.result_version,
        'updatedAt',receipt.result_updated_at,'replayed',true,'changed',receipt.changed);
    end if;
  end if;
  if not private.consume_draft_attempt(actor) then return '{"ok":false,"code":"rate_limited"}'::jsonb; end if;
  if p_request_id is null then return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  if receipt.request_id is not null then return '{"ok":false,"code":"request_conflict"}'::jsonb; end if;
  if checked ->> 'ok' <> 'true' then return checked; end if;
  if not private.check_draft_references(draft) then return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  -- Keep quota outside this guarded business subtransaction. Every content/history/
  -- receipt write rolls back together if any stage fails, including receipt insertion.
  begin
    insert into public.articles(owner_profile_id,section_id,title,slug,excerpt,content,seo_keyphrase,meta_description)
    values(owner_id,(draft ->> 'sectionId')::uuid,draft ->> 'title',draft ->> 'slug',draft ->> 'excerpt',
      nullif(draft -> 'content','null'::jsonb),draft ->> 'seoKeyphrase',draft ->> 'metaDescription')
    returning id,updated_at into article_id,committed_at;
    insert into public.article_categories(article_id,category_id,section_id)
      select article_id,value::uuid,(draft ->> 'sectionId')::uuid from jsonb_array_elements_text(draft -> 'categoryIds');
    insert into public.article_tags(article_id,tag_id)
      select article_id,value::uuid from jsonb_array_elements_text(draft -> 'tagIds');
    insert into public.article_contributors(article_id,profile_id,contribution_role,display_order)
      select article_id,(value ->> 'profileId')::uuid,(value ->> 'role')::public.contribution_role,
        (value ->> 'displayOrder')::integer from jsonb_array_elements(draft -> 'contributors');
    insert into public.article_revisions(article_id,actor_user_id,snapshot)
      values(article_id,actor,private.capture_draft_snapshot(article_id));
    insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
      values(actor,'article.created','article',article_id,p_request_id);
    insert into private.draft_write_receipts(actor_user_id,request_id,operation,article_id,payload_hash,result_version,result_updated_at,changed)
      values(actor,p_request_id,'create',article_id,fingerprint,1,committed_at,true);
  exception when unique_violation then
    get stacked diagnostics failed_constraint=constraint_name;
    if failed_constraint='articles_slug_key' then return '{"ok":false,"code":"slug_conflict"}'::jsonb; end if;
    raise log 'draft create failed state=% request=%',sqlstate,p_request_id;
    return '{"ok":false,"code":"unavailable"}'::jsonb;
  when others then
    raise log 'draft create failed state=% request=%',sqlstate,p_request_id;
    return '{"ok":false,"code":"unavailable"}'::jsonb;
  end;
  return jsonb_build_object('ok',true,'articleId',article_id,'version',1,'updatedAt',committed_at,'replayed',false,'changed',true);
exception when others then
  raise log 'draft create failed state=% request=%',sqlstate,p_request_id;
  return '{"ok":false,"code":"unavailable"}'::jsonb;
end;
$$;
revoke all on function public.create_article_draft(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_article_draft(uuid,jsonb) to authenticated;
