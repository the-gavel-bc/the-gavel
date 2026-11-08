import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { DraftInput } from "../../../src/shared/articles/draft-contract/draft-contract";
import {
  ACTOR,
  PROFILE,
  SECTION,
  CATEGORY,
  GUEST,
  DRAFT,
  beginAsActor,
} from "../draft-fixtures/draft-fixtures";
import { saveCommand, withSaveFixtures } from "../save-fixtures/save-fixtures";
import { waitForLock } from "../database-session/database-session";

describe("save checks after a competing transaction commits", () => {
  const cases: {
    name: string;
    change: (id: string) => string;
    draft: DraftInput;
    code: string;
  }[] = [
    {
      name: "identity",
      change: () =>
        `update auth.users set raw_app_meta_data='{"provider":"email"}' where id='${ACTOR}';`,
      draft: DRAFT,
      code: "forbidden",
    },
    {
      name: "membership",
      change: () =>
        `update public.memberships set active=false where user_id='${ACTOR}';`,
      draft: DRAFT,
      code: "forbidden",
    },
    {
      name: "owner profile",
      change: () =>
        `update public.profiles set active=false where id='${PROFILE}';`,
      draft: DRAFT,
      code: "forbidden",
    },
    {
      name: "section",
      change: () =>
        `update public.sections set active=false where id='${SECTION}';`,
      draft: { ...DRAFT, title: "Attempted" },
      code: "invalid_input",
    },
    {
      name: "category",
      change: () =>
        `update public.categories set active=false where id='${CATEGORY}';`,
      draft: { ...DRAFT, categoryIds: [CATEGORY] },
      code: "invalid_input",
    },
    {
      name: "credited profile",
      change: () =>
        `update public.profiles set active=false where id='${GUEST}';`,
      draft: {
        ...DRAFT,
        contributors: [{ profileId: GUEST, role: "writer", displayOrder: 0 }],
      },
      code: "invalid_input",
    },
    {
      name: "article status",
      change: (id) =>
        `update public.articles set status='published',published_at=now() where id='${id}';`,
      draft: DRAFT,
      code: "conflict",
    },
    {
      name: "article version",
      change: (id) =>
        `update public.articles set edit_version=2 where id='${id}';`,
      draft: DRAFT,
      code: "conflict",
    },
    {
      name: "stored content format",
      change: (id) =>
        `update public.articles set content='{"legacy":"preserved"}' where id='${id}';`,
      draft: DRAFT,
      code: "unsupported_content",
    },
  ];
  for (const c of cases)
    it(`observes changed ${c.name} after a real lock wait`, async () => {
      await withSaveFixtures(async ({ observer, a, b, articleId }) => {
        await a.execute(`begin;${c.change(articleId)}`);
        await beginAsActor(b);
        const pending = b.json(
          saveCommand(articleId, 1, randomUUID(), c.draft),
        );
        await waitForLock(observer, b);
        await a.execute("commit;");
        expect(await pending).toEqual({ ok: false, code: c.code });
        await b.execute("commit;");
        expect(
          await observer.json<string>(
            `to_jsonb((select title from public.articles where id='${articleId}'))`,
          ),
        ).toBe(DRAFT.title);
        expect(
          await observer.json<number>(
            `(select count(*) from public.article_revisions where article_id='${articleId}')`,
          ),
        ).toBe(1);
        expect(
          await observer.json<number>(
            `(select count(*) from private.draft_write_receipts where article_id='${articleId}' and operation='save')`,
          ),
        ).toBe(0);
      });
    });
});
