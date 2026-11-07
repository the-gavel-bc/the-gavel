-- Profile writes and publication/link changes share this lock. A deactivation
-- that wins first makes publication fail; publication that wins first freezes
-- the slug and makes later deactivation fail.
create function private.guard_published_profile_references()
returns trigger language plpgsql volatile security definer set search_path='' as $$
declare profile_ids uuid[]; blocked boolean;
begin
  perform pg_catalog.pg_advisory_xact_lock(72300320261106::bigint);
  if TG_TABLE_NAME='articles' then
    if new.status<>'published' then return new; end if;
    select pg_catalog.array_agg(distinct id) into profile_ids from (
      select new.owner_profile_id as id
      union all
      select c.profile_id from public.article_contributors c where c.article_id=new.id
    ) refs;
  else
    if not exists(select 1 from public.articles a
      where a.id=new.article_id and a.status='published') then return new; end if;
    profile_ids := array[new.profile_id];
  end if;
  select exists(select 1 from public.profiles p
    where p.id=any(profile_ids) and not p.active) into blocked;
  if blocked then
    raise exception 'Published article references inactive contributor.' using errcode='23514';
  end if;
  update public.profiles set slug_frozen=true
    where id=any(profile_ids) and not slug_frozen;
  return new;
end;
$$;
revoke all on function private.guard_published_profile_references()
from public,anon,authenticated;

create trigger articles_freeze_contributor_slugs
after insert or update of status,owner_profile_id on public.articles
for each row execute function private.guard_published_profile_references();
create trigger article_credits_freeze_contributor_slugs
after insert or update of profile_id on public.article_contributors
for each row execute function private.guard_published_profile_references();
