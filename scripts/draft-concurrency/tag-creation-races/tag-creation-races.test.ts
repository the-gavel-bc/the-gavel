import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { waitForLock } from "../database-session/database-session";
import {
  ACTOR,
  beginAsActor,
  withDraftFixtures,
} from "../draft-fixtures/draft-fixtures";

it("uses the last daily slot once when two fresh tag requests overlap", async () => {
  await withDraftFixtures(async ({ observer, a, b }) => {
    const firstName = `Tag race ${randomUUID()}`;
    const otherName = `Tag race ${randomUUID()}`;
    await observer.execute(`insert into private.member_tag_creation_limits(actor_user_id,quota_day,created_count)
      values('${ACTOR}',private.tag_creation_day(clock_timestamp()),29);`);
    try {
      await beginAsActor(a);
      const created = await a.json(`public.ensure_tag('${firstName}')`);
      expect(created).toMatchObject({ ok: true, created: true });
      await beginAsActor(b);
      const competing = b.json(`public.ensure_tag('${otherName}')`);
      await waitForLock(observer, b);
      await a.execute("commit;");
      expect(await competing).toEqual({ ok: false, code: "conflict" });
      expect(await b.json(`public.ensure_tag('${firstName}')`)).toMatchObject({
        ok: true,
        created: false,
      });
      await b.execute("commit;");
      expect(
        await observer.json(
          `(select created_count from private.member_tag_creation_limits where actor_user_id='${ACTOR}')`,
        ),
      ).toBe(30);
      expect(
        await observer.json(
          `(select count(*) from public.tags where name in('${firstName}','${otherName}'))`,
        ),
      ).toBe(1);
    } finally {
      await Promise.all([a.close(), b.close()]);
      await observer.execute(
        `delete from public.tags where name in ('${firstName}','${otherName}');`,
      );
    }
  });
});
