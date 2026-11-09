import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { DraftWriteResult } from "../../../src/shared/articles/draft-contract/draft-contract";
import { DRAFT, PROFILE, beginAsActor } from "../draft-fixtures/draft-fixtures";
import {
  beginAsAdmin,
  saveCommand,
  withSaveFixtures,
} from "../save-fixtures/save-fixtures";
import { waitForLock } from "../database-session/database-session";

describe("versioned save races", () => {
  it("two different requests with one expected version commit one save and one conflict", async () => {
    await withSaveFixtures(async ({ observer, a, b, articleId }) => {
      await beginAsActor(a);
      const first = await a.json<DraftWriteResult>(
        saveCommand(articleId, 1, randomUUID(), { ...DRAFT, title: "First" }),
      );
      expect(first.ok && first.version).toBe(2);
      await beginAsActor(b);
      const pending = b.json(
        saveCommand(articleId, 1, randomUUID(), { ...DRAFT, title: "Stale" }),
      );
      await waitForLock(observer, b);
      await a.execute("commit;");
      expect(await pending).toEqual({ ok: false, code: "conflict" });
      await b.execute("commit;");
      expect(
        await observer.json(
          `(select jsonb_build_object('title',title,'version',edit_version) from public.articles where id='${articleId}')`,
        ),
      ).toEqual({ title: "First", version: 2 });
      expect(
        await observer.json<number>(
          `(select count(*) from public.article_revisions where article_id='${articleId}')`,
        ),
      ).toBe(2);
    });
  });
  it("simultaneous identical requests emit one changed save and one replay", async () => {
    await withSaveFixtures(async ({ observer, a, b, articleId }) => {
      const command = saveCommand(articleId, 1, randomUUID(), {
        ...DRAFT,
        title: "Saved once",
      });
      await beginAsActor(a);
      const first = await a.json<DraftWriteResult>(command);
      expect(first.ok).toBe(true);
      await beginAsActor(b);
      const pending = b.json(command);
      await waitForLock(observer, b);
      await a.execute("commit;");
      expect(await pending).toEqual({ ...first, replayed: true });
      await b.execute("commit;");
      expect(
        await observer.json<number>(
          `(select count(*) from public.audit_events where resource_id='${articleId}' and action='article.updated')`,
        ),
      ).toBe(1);
      expect(
        await observer.json<number>(
          `(select count(*) from private.draft_write_receipts where article_id='${articleId}' and operation='save')`,
        ),
      ).toBe(1);
    });
  });
  for (const adminFirst of [false, true])
    it(`${adminFirst ? "admin" : "owner"} save wins; competing ${adminFirst ? "owner" : "admin"} observes current version`, async () => {
      await withSaveFixtures(async ({ observer, a, b, articleId }) => {
        await (adminFirst ? beginAsAdmin : beginAsActor)(a);
        expect(
          (
            await a.json<DraftWriteResult>(
              saveCommand(articleId, 1, randomUUID(), {
                ...DRAFT,
                title: "Winner",
              }),
            )
          ).ok,
        ).toBe(true);
        await (adminFirst ? beginAsActor : beginAsAdmin)(b);
        const pending = b.json(
          saveCommand(articleId, 1, randomUUID(), { ...DRAFT, title: "Loser" }),
        );
        await waitForLock(observer, b);
        await a.execute("commit;");
        expect(await pending).toEqual({ ok: false, code: "conflict" });
        await b.execute("commit;");
        expect(
          await observer.json(
            `(select jsonb_build_object('owner',owner_profile_id,'title',title,'version',edit_version) from public.articles where id='${articleId}')`,
          ),
        ).toEqual({ owner: PROFILE, title: "Winner", version: 2 });
      });
    });
  it("late retry returns an old receipt without undoing another session's later edit", async () => {
    await withSaveFixtures(async ({ observer, a, b, articleId }) => {
      const command = saveCommand(articleId, 1, randomUUID(), {
        ...DRAFT,
        title: "Old response",
      });
      await beginAsActor(a);
      expect((await a.json<DraftWriteResult>(command)).ok).toBe(true);
      await a.execute("commit;");
      await beginAsActor(b);
      expect(
        (
          await b.json<DraftWriteResult>(
            saveCommand(articleId, 2, randomUUID(), {
              ...DRAFT,
              title: "Newer edit",
            }),
          )
        ).ok,
      ).toBe(true);
      await b.execute("commit;");
      await beginAsActor(a);
      const replay = await a.json<DraftWriteResult>(command);
      expect(replay.ok && replay.version).toBe(2);
      expect(replay.ok && replay.replayed).toBe(true);
      await a.execute("commit;");
      expect(
        await observer.json(
          `(select jsonb_build_object('title',title,'version',edit_version) from public.articles where id='${articleId}')`,
        ),
      ).toEqual({ title: "Newer edit", version: 3 });
      expect(
        await observer.json<number>(
          `(select count(*) from public.article_revisions where article_id='${articleId}')`,
        ),
      ).toBe(3);
    });
  });
});
