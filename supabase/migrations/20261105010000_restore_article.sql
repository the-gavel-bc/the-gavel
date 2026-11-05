-- Extend the existing lifecycle receipt and transition boundary without rewriting stored articles.
alter table private.draft_write_receipts drop constraint draft_write_receipts_operation_check;
alter table private.draft_write_receipts add constraint draft_write_receipts_operation_check
  check (operation in ('create','save','save_published','publish','archive','restore'));
alter table private.draft_write_receipts drop constraint draft_write_receipts_check;
alter table private.draft_write_receipts add constraint draft_write_receipts_check
  check ((operation='create' and expected_version is null)
    or (operation in ('save','save_published','publish','archive','restore')
      and expected_version >= 1 and expected_version is not null));

create or replace function private.transition_article(
  p_article_id uuid,p_expected_version integer,p_request_id uuid,p_operation text
) returns jsonb language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare
  actor uuid := auth.uid(); actor_profile uuid; fingerprint bytea;
  receipt private.draft_write_receipts%rowtype; article public.articles%rowtype;
  snapshot jsonb; current_input jsonb; checked jsonb;
  committed_version integer; committed_at timestamptz; result_status text;
begin
  if p_operation not in ('publish','archive','restore') then
    return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  actor_profile := private.lock_draft_actor();
  if actor_profile is null then return '{"ok":false,"code":"forbidden"}'::jsonb; end if;
  if p_operation='restore' and not private.is_active_administrator() then
    return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  if p_article_id is null or p_request_id is null or p_expected_version is null
    or p_expected_version < 1 then return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  fingerprint := private.draft_request_hash(p_operation,p_article_id,p_expected_version,'{}'::jsonb);
  select * into receipt from private.draft_write_receipts
    where actor_user_id=actor and request_id=p_request_id;
  if receipt.request_id is not null and receipt.operation=p_operation
    and receipt.payload_hash=fingerprint then
    select * into article from public.articles where id=p_article_id
      and (owner_profile_id=actor_profile or private.is_active_administrator()) for update;
    if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
    result_status := case p_operation when 'archive' then 'archived' else 'published' end;
    return jsonb_build_object('ok',true,'articleId',receipt.article_id,
      'status',result_status,'version',receipt.result_version,
      'updatedAt',receipt.result_updated_at,'replayed',true,'changed',receipt.changed);
  end if;
  if not private.consume_draft_attempt(actor) then return '{"ok":false,"code":"rate_limited"}'::jsonb; end if;
  if receipt.request_id is not null then return '{"ok":false,"code":"request_conflict"}'::jsonb; end if;
  select * into article from public.articles where id=p_article_id
    and (owner_profile_id=actor_profile or private.is_active_administrator()) for update;
  if not found then return '{"ok":false,"code":"not_found"}'::jsonb; end if;
  if article.edit_version<>p_expected_version or article.edit_version=2147483647
    or (p_operation='publish' and article.status<>'draft')
    or (p_operation='archive' and article.status<>'published')
    or (p_operation='restore' and article.status<>'archived') then
    return '{"ok":false,"code":"conflict"}'::jsonb; end if;
  if p_operation in ('publish','restore') then
    snapshot := private.capture_draft_snapshot(p_article_id);
    current_input := (snapshot->'article') - array[
      'id','ownerProfileId','status','publishedAt','archivedAt','createdAt','updatedAt','editVersion','slug'
    ] || jsonb_build_object('schemaVersion',1,'categoryIds',snapshot->'categoryIds',
      'tagIds',snapshot->'tagIds','contributors',snapshot->'contributors');
    checked := private.check_draft_input(current_input);
    if checked->>'ok'<>'true' then return checked; end if;
    if not private.is_publication_ready(p_article_id,checked->'value') then
      return '{"ok":false,"code":"invalid_input"}'::jsonb; end if;
  end if;
  begin
    if p_operation='publish' then
      update public.articles set status='published',published_at=now(),edit_version=edit_version+1
        where id=p_article_id returning edit_version,updated_at into committed_version,committed_at;
      result_status := 'published';
    elsif p_operation='archive' then
      update public.articles set status='archived',archived_at=now(),edit_version=edit_version+1
        where id=p_article_id returning edit_version,updated_at into committed_version,committed_at;
      result_status := 'archived';
    else
      update public.articles set status='published',archived_at=null,edit_version=edit_version+1
        where id=p_article_id returning edit_version,updated_at into committed_version,committed_at;
      result_status := 'published';
    end if;
    insert into public.article_revisions(article_id,actor_user_id,snapshot)
      values(p_article_id,actor,private.capture_draft_snapshot(p_article_id));
    insert into public.audit_events(actor_user_id,action,resource_type,resource_id,correlation_id)
      values(actor,'article.'||case p_operation when 'publish' then 'published'
        when 'archive' then 'archived' else 'restored' end,'article',p_article_id,p_request_id);
    insert into private.draft_write_receipts(actor_user_id,request_id,operation,article_id,
      expected_version,payload_hash,result_version,result_updated_at,changed)
      values(actor,p_request_id,p_operation,p_article_id,p_expected_version,
        fingerprint,committed_version,committed_at,true);
  exception when others then
    raise log 'article transition failed state=% request=%',sqlstate,p_request_id;
    return '{"ok":false,"code":"unavailable"}'::jsonb;
  end;
  return jsonb_build_object('ok',true,'articleId',p_article_id,'status',result_status,
    'version',committed_version,'updatedAt',committed_at,'replayed',false,'changed',true);
exception when others then
  raise log 'article transition failed state=% request=%',sqlstate,p_request_id;
  return '{"ok":false,"code":"unavailable"}'::jsonb;
end;
$$;

create function public.restore_article(p_article_id uuid,p_expected_version integer,p_request_id uuid)
returns jsonb language sql security definer set search_path = '' set timezone = 'UTC' as $$
  select private.transition_article(p_article_id,p_expected_version,p_request_id,'restore');
$$;
revoke all on function public.restore_article(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.restore_article(uuid,integer,uuid) to authenticated;
