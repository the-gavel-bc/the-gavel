import type { DraftInput } from "../../../src/lib/articles/draft-contract/draft-contract";
import {
  DatabaseSession,
  fixtureJson,
} from "../database-session/database-session";
export const ACTOR = "00000000-0000-0000-0000-000000000751";
export const PROFILE = "10000000-0000-0000-0000-000000000751";
export const SECTION = "20000000-0000-0000-0000-000000000751";
export const CATEGORY = "30000000-0000-0000-0000-000000000751";
export const GUEST = "10000000-0000-0000-0000-000000000752";
export const DRAFT: DraftInput = {
  schemaVersion: 1,
  title: "Synthetic Race Draft",
  sectionId: SECTION,
  excerpt: null,
  content: null,
  seoKeyphrase: null,
  metaDescription: null,
  categoryIds: [],
  tagIds: [],
  contributors: [],
};
export function createCommand(
  requestId: string,
  draft: DraftInput = DRAFT,
): string {
  if (!/^[0-9a-f-]{36}$/u.test(requestId))
    throw new Error("Only synthetic UUID request IDs are allowed.");
  return `public.create_article_draft('${requestId}'::uuid,${fixtureJson(draft)})`;
}
export async function beginAsActor(session: DatabaseSession): Promise<void> {
  await session.execute(
    `begin;set local request.jwt.claim.sub='${ACTOR}';set local role authenticated;`,
  );
}
type Sessions = {
  observer: DatabaseSession;
  a: DatabaseSession;
  b: DatabaseSession;
};
export async function withDraftFixtures(
  run: (sessions: Sessions) => Promise<void>,
): Promise<void> {
  const observer = new DatabaseSession(),
    a = new DatabaseSession(),
    b = new DatabaseSession();
  let prepared = false;
  try {
    await Promise.all([observer.ready(), a.ready(), b.ready()]);
    if (
      await observer.json<boolean>(
        `exists(select 1 from auth.users where id='${ACTOR}') or exists(select 1 from public.sections where id='${SECTION}')`,
      )
    )
      throw new Error(
        "Reserved local race fixtures already exist; refusing to overwrite data.",
      );
    await observer.execute(`begin;
      insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values('${ACTOR}','gavel-draft-race@bc.edu',now(),'{"provider":"google"}');
      insert into public.profiles(id,auth_user_id,display_name,slug) values('${PROFILE}','${ACTOR}','Synthetic Race Author','synthetic-race-author');
      insert into public.profiles(id,display_name,slug) values('${GUEST}','Synthetic Race Guest','synthetic-race-guest');
      insert into public.memberships(user_id,active,approved_by,approved_at) values('${ACTOR}',true,'00000000-0000-0000-0000-000000000004',now());
      insert into public.sections(id,name,slug) values('${SECTION}','Synthetic Race Section','synthetic-race-section');
      insert into public.categories(id,section_id,name,slug) values('${CATEGORY}','${SECTION}','Synthetic Race Category','synthetic-race-category');
      commit;`);
    prepared = true;
    await run({ observer, a, b });
  } finally {
    await Promise.all([a.close(), b.close()]);
    try {
      if (prepared)
        await observer.execute(`begin;
      delete from private.draft_write_receipts where actor_user_id='${ACTOR}';
      delete from private.draft_write_limits where actor_user_id='${ACTOR}';
      delete from public.audit_events where actor_user_id='${ACTOR}';
      delete from public.article_revisions where actor_user_id='${ACTOR}';
      delete from public.article_categories where article_id in(select id from public.articles where owner_profile_id='${PROFILE}');
      delete from public.article_tags where article_id in(select id from public.articles where owner_profile_id='${PROFILE}');
      delete from public.article_contributors where article_id in(select id from public.articles where owner_profile_id='${PROFILE}');
      delete from public.articles where owner_profile_id='${PROFILE}';
      delete from public.categories where id='${CATEGORY}';delete from public.sections where id='${SECTION}';
      delete from public.profiles where id in('${PROFILE}','${GUEST}');
      delete from public.memberships where user_id='${ACTOR}';delete from auth.users where id='${ACTOR}';commit;`);
    } finally {
      await observer.close();
    }
  }
}
