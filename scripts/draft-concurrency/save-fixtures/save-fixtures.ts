import type {
  DraftInput,
  DraftWriteResult,
} from "../../../src/shared/articles/draft-contract/draft-contract";
import {
  DatabaseSession,
  fixtureJson,
} from "../database-session/database-session";
import {
  DRAFT,
  beginAsActor,
  createCommand,
  withDraftFixtures,
} from "../draft-fixtures/draft-fixtures";
import { randomUUID } from "node:crypto";
export const ADMIN = "00000000-0000-0000-0000-000000000753";
const ADMIN_PROFILE = "10000000-0000-0000-0000-000000000753";
export function saveCommand(
  articleId: string,
  version: number,
  requestId: string,
  draft: DraftInput = DRAFT,
): string {
  if (
    ![articleId, requestId].every((id) => /^[0-9a-f-]{36}$/u.test(id)) ||
    !Number.isInteger(version) ||
    version < 1 ||
    version > 2147483647
  )
    throw new Error("Only synthetic UUID/integer save commands are allowed.");
  return `public.save_article_draft('${articleId}'::uuid,${version},'${requestId}'::uuid,${fixtureJson(draft)})`;
}
export async function beginAsAdmin(session: DatabaseSession): Promise<void> {
  await session.execute(
    `begin;set local request.jwt.claim.sub='${ADMIN}';set local role authenticated;`,
  );
}
type SaveSessions = {
  observer: DatabaseSession;
  a: DatabaseSession;
  b: DatabaseSession;
  articleId: string;
};
export async function withSaveFixtures(
  run: (sessions: SaveSessions) => Promise<void>,
): Promise<void> {
  await withDraftFixtures(async ({ observer, a, b }) => {
    let prepared = false;
    try {
      if (
        await observer.json<boolean>(
          `exists(select 1 from auth.users where id='${ADMIN}') or exists(select 1 from public.profiles where id='${ADMIN_PROFILE}')`,
        )
      )
        throw new Error(
          "Reserved save administrator already exists; refusing to overwrite data.",
        );
      await observer.execute(`begin;
        insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values('${ADMIN}','gavel-save-admin@bc.edu',now(),'{"provider":"google"}');
        insert into public.profiles(id,auth_user_id,display_name,slug) values('${ADMIN_PROFILE}','${ADMIN}','Synthetic Save Admin','synthetic-save-admin');
        insert into public.memberships(user_id,role,active,approved_by,approved_at) values('${ADMIN}','administrator',true,'00000000-0000-0000-0000-000000000004',now());commit;`);
      prepared = true;
      await beginAsActor(a);
      const created = await a.json<DraftWriteResult>(
        createCommand(randomUUID()),
      );
      if (!created.ok)
        throw new Error("Synthetic save fixture creation failed.");
      await a.execute("commit;");
      await run({ observer, a, b, articleId: created.articleId });
    } finally {
      await Promise.all([a.close(), b.close()]);
      if (prepared)
        await observer.execute(`begin;
        delete from private.draft_write_receipts where actor_user_id='${ADMIN}';
        delete from private.draft_write_limits where actor_user_id='${ADMIN}';
        delete from public.audit_events where actor_user_id='${ADMIN}';
        delete from public.article_revisions where actor_user_id='${ADMIN}';
        delete from public.profiles where id='${ADMIN_PROFILE}';
        delete from public.memberships where user_id='${ADMIN}';delete from auth.users where id='${ADMIN}';commit;`);
    }
  });
}
