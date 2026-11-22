import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { waitForLock } from "../database-session/database-session";
import {
  ACTOR,
  beginAsActor,
  withDraftFixtures,
} from "../draft-fixtures/draft-fixtures";

it("uses the last guest quota slot once while an exact retry waits", async () => {
  await withDraftFixtures(async ({ observer, a, b }) => {
    const requestId = randomUUID();
    const command = `public.create_guest_contributor('${requestId}','Synthetic Guest Quota Race')`;
    await observer.execute(
      `insert into private.draft_write_limits(actor_user_id,attempt_count) values('${ACTOR}',29);`,
    );
    try {
      await beginAsActor(a);
      const first = await a.json(command);
      expect(first).toMatchObject({ ok: true, created: true, replayed: false });

      await beginAsActor(b);
      const retry = b.json(command);
      await waitForLock(observer, b);
      await a.execute("commit;");
      expect(await retry).toMatchObject({ replayed: true, ok: true });
      await b.execute("commit;");

      await beginAsActor(b);
      expect(
        await b.json(
          `public.create_guest_contributor('${randomUUID()}','Synthetic Guest Over Quota')`,
        ),
      ).toEqual({ ok: false, code: "rate_limited" });
      await b.execute("rollback;");

      expect(
        await observer.json(
          `(select attempt_count from private.draft_write_limits where actor_user_id='${ACTOR}')`,
        ),
      ).toBe(30);
      expect(
        await observer.json(
          `(select count(*) from private.profile_write_receipts where actor_user_id='${ACTOR}')`,
        ),
      ).toBe(1);
      expect(
        await observer.json(
          `(select count(*) from public.audit_events where actor_user_id='${ACTOR}' and action='profile.created')`,
        ),
      ).toBe(1);
    } finally {
      await Promise.all([a.close(), b.close()]);
      await observer.execute(`with guest_receipts as (
        delete from private.profile_write_receipts
          where actor_user_id='${ACTOR}' and operation='create_guest_author'
          returning profile_id
        )
        delete from public.profiles where id in(select profile_id from guest_receipts);`);
    }
  });
});
