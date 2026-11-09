import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  DraftInput,
  DraftWriteResult,
} from "../../../src/shared/articles/draft-contract/draft-contract";
import {
  ACTOR,
  PROFILE,
  SECTION,
  CATEGORY,
  GUEST,
  DRAFT,
  beginAsActor,
  createCommand,
  withDraftFixtures,
} from "../draft-fixtures/draft-fixtures";
import { waitForLock } from "../database-session/database-session";

describe("post-wait eligibility and selection checks", () => {
  const cases: {
    name: string;
    change: string;
    draft: DraftInput;
    code: string;
  }[] = [
    {
      name: "trusted identity",
      change: `update auth.users set raw_app_meta_data='{"provider":"email"}' where id='${ACTOR}';`,
      draft: DRAFT,
      code: "forbidden",
    },
    {
      name: "membership",
      change: `update public.memberships set active=false where user_id='${ACTOR}';`,
      draft: DRAFT,
      code: "forbidden",
    },
    {
      name: "owner profile",
      change: `update public.profiles set active=false where id='${PROFILE}';`,
      draft: DRAFT,
      code: "forbidden",
    },
    {
      name: "primary section",
      change: `update public.sections set active=false where id='${SECTION}';`,
      draft: DRAFT,
      code: "invalid_input",
    },
    {
      name: "category",
      change: `update public.categories set active=false where id='${CATEGORY}';`,
      draft: { ...DRAFT, categoryIds: [CATEGORY] },
      code: "invalid_input",
    },
    {
      name: "credited profile",
      change: `update public.profiles set active=false where id='${GUEST}';`,
      draft: {
        ...DRAFT,
        contributors: [{ profileId: GUEST, role: "writer", displayOrder: 0 }],
      },
      code: "invalid_input",
    },
  ];
  for (const c of cases)
    it(`rejects a ${c.name} deactivation committed while the call waits`, async () => {
      await withDraftFixtures(async ({ observer, a, b }) => {
        await a.execute(`begin;${c.change}`);
        await beginAsActor(b);
        const pending = b.json<DraftWriteResult>(
          createCommand(randomUUID(), c.draft),
        );
        await waitForLock(observer, b);
        await a.execute("commit;");
        expect(await pending).toEqual({ ok: false, code: c.code });
        await b.execute("commit;");
        expect(
          await observer.json<number>(
            `(select count(*) from public.articles where owner_profile_id='${PROFILE}')`,
          ),
        ).toBe(0);
        expect(
          await observer.json<number>(
            `(select count(*) from private.draft_write_receipts where actor_user_id='${ACTOR}')`,
          ),
        ).toBe(0);
      });
    });
});
