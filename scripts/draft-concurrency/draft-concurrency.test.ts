import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { DraftWriteResult } from "../../src/lib/articles/draft-contract/draft-contract";
import {
  ACTOR,
  beginAsActor,
  createCommand,
  withDraftFixtures,
} from "./draft-fixtures/draft-fixtures";
import { waitForLock } from "./database-session/database-session";

describe("serialized draft create operations", () => {
  it("allocates distinct slugs for concurrent same-title creates by different authors", async () => {
    await withDraftFixtures(async ({ observer, a, b }) => {
      const otherUser = "00000000-0000-0000-0000-000000000754";
      const otherProfile = "10000000-0000-0000-0000-000000000754";
      await observer.execute(`begin;
        insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values('${otherUser}','gavel-slug-race@bc.edu',now(),'{"provider":"google"}');
        insert into public.profiles(id,auth_user_id,display_name,slug) values('${otherProfile}','${otherUser}','Synthetic Slug Racer','synthetic-slug-racer');
        insert into public.memberships(user_id,active,approved_by,approved_at) values('${otherUser}',true,'00000000-0000-0000-0000-000000000004',now());commit;`);
      try {
        await beginAsActor(a);
        const first = await a.json<DraftWriteResult>(
          createCommand(randomUUID()),
        );
        expect(first.ok).toBe(true);
        await b.execute(
          `begin;set local request.jwt.claim.sub='${otherUser}';set local role authenticated;`,
        );
        const pending = b.json<DraftWriteResult>(createCommand(randomUUID()));
        await waitForLock(observer, b);
        await a.execute("commit;");
        const second = await pending;
        await b.execute("commit;");
        expect(second.ok).toBe(true);
        if (!first.ok || !second.ok)
          throw new Error("Synthetic create failed.");
        expect(
          await observer.json<string>(
            `(select to_jsonb(slug) from public.articles where id='${first.articleId}')`,
          ),
        ).toBe("synthetic-race-draft");
        expect(
          await observer.json<string>(
            `(select to_jsonb(slug) from public.articles where id='${second.articleId}')`,
          ),
        ).toBe("synthetic-race-draft-2");
      } finally {
        await observer.execute(`begin;
          delete from private.draft_write_receipts where actor_user_id='${otherUser}';
          delete from private.draft_write_limits where actor_user_id='${otherUser}';
          delete from public.audit_events where actor_user_id='${otherUser}';
          delete from public.article_revisions where actor_user_id='${otherUser}';
          delete from private.article_id_registry where article_id in (select id from public.articles where owner_profile_id='${otherProfile}');
          delete from public.articles where owner_profile_id='${otherProfile}';
          delete from public.memberships where user_id='${otherUser}';
          delete from public.profiles where id='${otherProfile}';
          delete from auth.users where id='${otherUser}';commit;`);
      }
    });
  });
  it("two identical in-flight creates commit one article/history set and one replay", async () => {
    await withDraftFixtures(async ({ observer, a, b }) => {
      const command = createCommand(randomUUID());
      await beginAsActor(a);
      const first = await a.json<DraftWriteResult>(command);
      expect(first.ok).toBe(true);
      if (!first.ok) throw new Error("Fixture create failed.");
      await beginAsActor(b);
      const pending = b.json<DraftWriteResult>(command);
      await waitForLock(observer, b);
      await a.execute("commit;");
      const second = await pending;
      expect(second).toEqual({ ...first, replayed: true });
      await b.execute("commit;");
      expect(
        await observer.json<number>(
          `(select count(*) from public.articles where id='${first.articleId}')`,
        ),
      ).toBe(1);
      expect(
        await observer.json<number>(
          `(select count(*) from public.article_revisions where article_id='${first.articleId}')`,
        ),
      ).toBe(1);
      expect(
        await observer.json<number>(
          `(select count(*) from public.audit_events where resource_id='${first.articleId}')`,
        ),
      ).toBe(1);
      expect(
        await observer.json<number>(
          `(select count(*) from private.draft_write_receipts where actor_user_id='${ACTOR}')`,
        ),
      ).toBe(1);
      expect(
        await observer.json<number>(
          `(select attempt_count from private.draft_write_limits where actor_user_id='${ACTOR}')`,
        ),
      ).toBe(1);
    });
  });
  it("competing invalid requests cannot consume more than the remaining quota", async () => {
    await withDraftFixtures(async ({ observer, a, b }) => {
      await observer.execute(
        `insert into private.draft_write_limits(actor_user_id,attempt_count) values('${ACTOR}',29);`,
      );
      await beginAsActor(a);
      expect(
        await a.json(`public.create_article_draft('${randomUUID()}','{}')`),
      ).toEqual({ ok: false, code: "invalid_input" });
      await beginAsActor(b);
      const pending = b.json(
        `public.create_article_draft('${randomUUID()}','{}')`,
      );
      await waitForLock(observer, b);
      await a.execute("commit;");
      expect(await pending).toEqual({ ok: false, code: "rate_limited" });
      await b.execute("commit;");
      expect(
        await observer.json<number>(
          `(select attempt_count from private.draft_write_limits where actor_user_id='${ACTOR}')`,
        ),
      ).toBe(30);
    });
  });
});
