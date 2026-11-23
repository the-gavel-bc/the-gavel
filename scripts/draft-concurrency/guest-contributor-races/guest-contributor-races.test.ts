import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { waitForLock } from "../database-session/database-session";
import {
  ACTOR,
  DRAFT,
  createCommand,
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

it("uses one open guest slot when two creations overlap", async () => {
  await withDraftFixtures(async ({ observer, a, b }) => {
    const token = randomUUID();
    const command = `public.create_guest_contributor('${randomUUID()}','Open race ${token}')`;
    const other = `public.create_guest_contributor('${randomUUID()}','Competing open race ${token}')`;
    await observer.execute(`with guests as (
      insert into public.profiles(display_name,slug)
      select 'Open race fixture ${token} '||n,'open-race-fixture-${token}-'||n
      from generate_series(1,49) n returning id
    )
    insert into private.profile_write_receipts(actor_user_id,request_id,operation,profile_id,payload_hash,result)
    select '${ACTOR}',gen_random_uuid(),'create_guest_author',id,
      private.membership_payload_hash(jsonb_build_object('fixture',id)),jsonb_build_object('created',true) from guests;`);
    try {
      await beginAsActor(a);
      const first = await a.json(command);
      expect(first).toMatchObject({ ok: true, created: true });
      await beginAsActor(b);
      const next = b.json(other);
      await waitForLock(observer, b);
      await a.execute("commit;");
      expect(await next).toEqual({ ok: false, code: "conflict" });
      expect(await b.json(command)).toMatchObject({ ok: true, replayed: true });
      await b.execute("commit;");
      expect(
        await observer.json(
          `(select count(*) from private.profile_write_receipts where actor_user_id='${ACTOR}')`,
        ),
      ).toBe(50);
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

it("keeps a guest credit when a draft attaches it during a sweep", async () => {
  await withDraftFixtures(async ({ observer, a, b }) => {
    const token = randomUUID();
    await observer.execute(`insert into public.profiles(id,display_name,slug,created_at)
      values('${token}','Sweep attachment fixture','sweep-attachment-${token}',now()-interval '31 days');
      insert into private.guest_credit_provenance(profile_id) values('${token}');
      insert into private.profile_write_receipts(actor_user_id,request_id,operation,profile_id,payload_hash,result,created_at)
      values('${ACTOR}','${token}','create_guest_author','${token}',
        private.membership_payload_hash(jsonb_build_object('fixture','${token}')),
        '{"created":true}',now()-interval '31 days');`);
    try {
      await beginAsActor(a);
      expect(
        await a.json(
          createCommand(randomUUID(), {
            ...DRAFT,
            contributors: [
              { profileId: token, role: "writer", displayOrder: 0 },
            ],
          }),
        ),
      ).toMatchObject({ ok: true });

      await b.execute("begin;set local role service_role;");
      expect(
        await b.json("public.sweep_orphan_guest_credits(100)"),
      ).toMatchObject({
        ok: true,
        deleted: 0,
      });
      await b.execute("commit;");
      await a.execute("commit;");
      expect(
        await observer.json(
          `exists(select 1 from public.article_contributors where profile_id='${token}')`,
        ),
      ).toBe(true);
    } finally {
      await Promise.all([a.close(), b.close()]);
      await observer.execute(`delete from public.article_contributors where profile_id='${token}';
        delete from private.profile_write_receipts where request_id='${token}';
        delete from public.profiles where id='${token}';`);
    }
  });
});

it("allows only one overlapping sweep to delete a credit", async () => {
  await withDraftFixtures(async ({ observer, a, b }) => {
    const token = randomUUID();
    await observer.execute(`insert into public.profiles(id,display_name,slug,created_at)
      values('${token}','Concurrent sweep fixture','sweep-race-${token}',now()-interval '31 days');
      insert into private.guest_credit_provenance(profile_id) values('${token}');
      insert into private.profile_write_receipts(actor_user_id,request_id,operation,profile_id,payload_hash,result,created_at)
      values('${ACTOR}','${token}','create_guest_author','${token}',
        private.membership_payload_hash(jsonb_build_object('fixture','${token}')),
        '{"created":true}',now()-interval '31 days');`);
    try {
      await a.execute("begin;set local role service_role;");
      expect(await a.json("public.sweep_orphan_guest_credits(100)")).toEqual({
        ok: true,
        deleted: 1,
        busy: false,
      });
      await b.execute("begin;set local role service_role;");
      expect(await b.json("public.sweep_orphan_guest_credits(100)")).toEqual({
        ok: true,
        deleted: 0,
        busy: true,
      });
      await b.execute("commit;");
      await a.execute("commit;");
      expect(
        await observer.json(
          `exists(select 1 from public.profiles where id='${token}')`,
        ),
      ).toBe(false);
    } finally {
      await Promise.all([a.close(), b.close()]);
      await observer.execute(`delete from private.profile_write_receipts where request_id='${token}';
        delete from public.profiles where id='${token}';`);
    }
  });
});
