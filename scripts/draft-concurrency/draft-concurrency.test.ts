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
