-- Invoker helpers run only inside the later privileged mutation boundary.
create function private.lock_draft_actor() returns uuid
language plpgsql set search_path = '' as $$
declare actor uuid := auth.uid(); profile_id uuid;
begin
  if actor is null then return null; end if;
  perform id from auth.users where id=actor for share;
  perform user_id from public.memberships where user_id=actor for share;
  select id into profile_id from public.profiles where auth_user_id=actor for share;
  if profile_id is null or not private.has_eligible_identity()
    or not exists(select 1 from public.memberships where user_id=actor and active)
    or not exists(select 1 from public.profiles where id=profile_id and active) then return null; end if;
  insert into private.draft_write_limits(actor_user_id) values(actor) on conflict do nothing;
  perform actor_user_id from private.draft_write_limits where actor_user_id=actor for update;
  -- A new statement after every possible wait observes current eligibility.
  if not private.has_eligible_identity()
    or not exists(select 1 from public.memberships where user_id=actor and active)
    or not exists(select 1 from public.profiles where id=profile_id and active) then return null; end if;
  return profile_id;
end;
$$;

create function private.consume_draft_attempt(p_actor_id uuid) returns boolean
language plpgsql set search_path = '' as $$
declare current_window timestamptz; attempts integer; checked_at timestamptz := clock_timestamp();
begin
  select window_start,attempt_count into current_window,attempts
    from private.draft_write_limits where actor_user_id=p_actor_id for update;
  if not found then return false; end if;
  if checked_at >= current_window + interval '60 seconds' then
    update private.draft_write_limits set window_start=checked_at,attempt_count=1 where actor_user_id=p_actor_id;
    return true;
  end if;
  if attempts >= 30 then return false; end if;
  update private.draft_write_limits set attempt_count=attempt_count+1 where actor_user_id=p_actor_id;
  return true;
end;
$$;

-- Normalize only validated JSON integer values; numeric scale is not a semantic change.
create function private.canonical_draft_json(p_value jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare result jsonb; item record; child jsonb;
begin
  case jsonb_typeof(p_value)
    when 'object' then
      result := '{}'::jsonb;
      for item in select key,value from jsonb_each(p_value) loop
        result := jsonb_set(result,array[item.key],private.canonical_draft_json(item.value));
      end loop;
    when 'array' then
      result := '[]'::jsonb;
      for child in select value from jsonb_array_elements(p_value) loop
        result := result || jsonb_set('[null]'::jsonb,'{0}',private.canonical_draft_json(child));
      end loop;
    when 'number' then result := ((p_value #>> '{}')::numeric::integer)::text::jsonb;
    else result := p_value;
  end case;
  return result;
end;
$$;

create function private.draft_request_hash(p_operation text,p_article_id uuid,p_expected_version integer,p_draft jsonb)
returns bytea language sql immutable set search_path = '' as $$
  select sha256(convert_to(p_operation || E'\n' || coalesce(p_article_id::text,'') || E'\n'
    || coalesce(p_expected_version::text,'') || E'\n' || private.canonical_draft_json(p_draft)::text,'UTF8'));
$$;

-- p_draft must be structurally checked/canonicalized before any UUID casts.
create function private.check_draft_references(p_draft jsonb) returns boolean
language plpgsql set search_path = '' as $$
declare section uuid := (p_draft ->> 'sectionId')::uuid; selected_categories uuid[]; selected_tags uuid[]; selected_profiles uuid[];
begin
  select coalesce(array_agg(value::uuid),'{}'::uuid[]) into selected_categories from jsonb_array_elements_text(p_draft -> 'categoryIds');
  select coalesce(array_agg(value::uuid),'{}'::uuid[]) into selected_tags from jsonb_array_elements_text(p_draft -> 'tagIds');
  select coalesce(array_agg(distinct (value ->> 'profileId')::uuid),'{}'::uuid[]) into selected_profiles from jsonb_array_elements(p_draft -> 'contributors');
  perform id from public.sections where id=section for share;
  perform id from public.categories where id=any(selected_categories) order by id for share;
  perform id from public.tags where id=any(selected_tags) order by id for share;
  perform id from public.profiles where id=any(selected_profiles) order by id for share;
  return exists(select 1 from public.sections where id=section and active)
    and (select count(*) from public.categories where id=any(selected_categories) and active and section_id=section)=cardinality(selected_categories)
    and (select count(*) from public.tags where id=any(selected_tags))=cardinality(selected_tags)
    and (select count(*) from public.profiles where id=any(selected_profiles) and active)=cardinality(selected_profiles);
end;
$$;
revoke all on function private.lock_draft_actor() from public,anon,authenticated;
revoke all on function private.consume_draft_attempt(uuid) from public,anon,authenticated;
revoke all on function private.canonical_draft_json(jsonb) from public,anon,authenticated;
revoke all on function private.draft_request_hash(text,uuid,integer,jsonb) from public,anon,authenticated;
revoke all on function private.check_draft_references(jsonb) from public,anon,authenticated;
