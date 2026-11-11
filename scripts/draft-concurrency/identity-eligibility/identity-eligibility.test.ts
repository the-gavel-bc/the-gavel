import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  DatabaseSession,
  fixtureJson,
  waitForLock,
} from "../database-session/database-session";
import { ACTOR } from "../draft-fixtures/draft-fixtures";
import { ADMIN, withSaveFixtures } from "../save-fixtures/save-fixtures";

type Sessions = {
  observer: DatabaseSession;
  a: DatabaseSession;
  b: DatabaseSession;
  articleId: string;
};
async function withAdministrators(run: (sessions: Sessions) => Promise<void>) {
  await withSaveFixtures(async (sessions) => {
    const { observer, a, b } = sessions;
    const prior = await observer.json(
      `(select coalesce(jsonb_agg(jsonb_build_object('id',user_id,'active',active,'revokedAt',revoked_at)),'[]')
        from public.memberships where role='administrator' and user_id<>'${ADMIN}')`,
    );
    try {
      await observer.execute(`update public.memberships set active=false,revoked_at=now()
          where role='administrator' and user_id<>'${ADMIN}';
        update public.memberships set active=true,role='administrator' where user_id='${ACTOR}';`);
      await run(sessions);
    } finally {
      // Closing tolerates exited sessions and releases any pending lock waits.
      await Promise.all([a.close(), b.close()]);
      await observer.execute(`update public.memberships m set active=p.active,revoked_at=p."revokedAt"
        from jsonb_to_recordset(${fixtureJson(prior)}) as p(id uuid,active boolean,"revokedAt" timestamptz)
        where m.user_id=p.id;
        delete from private.membership_write_receipts where actor_user_id in ('${ACTOR}','${ADMIN}');
        update public.memberships set role='author' where user_id='${ACTOR}';`);
    }
  });
}
async function asAdmin(session: DatabaseSession, id: string) {
  await session.execute(
    `begin;set local request.jwt.claim.sub='${id}';set local role authenticated;`,
  );
}
function demote(id: string, requestId = randomUUID()) {
  return `public.change_membership_role('${id}',1,'${requestId}','author')`;
}
const mixed = `'{"provider":"google","providers":["google","email"]}'::jsonb`;

it("concurrent eligible administrators cannot both remove their own authority", async () => {
  await withAdministrators(async ({ observer, a, b }) => {
    await asAdmin(a, ACTOR);
    expect(await a.json(demote(ACTOR))).toMatchObject({ ok: true });
    await asAdmin(b, ADMIN);
    const requestId = randomUUID();
    const pending = b.json(demote(ADMIN, requestId));
    await waitForLock(observer, b);
    await a.execute("commit;");
    expect(await pending).toEqual({ ok: false, code: "conflict" });
    await b.execute("commit;");
    expect(
      await observer.json(
        `(select count(*) from public.audit_events where correlation_id='${requestId}')`,
      ),
    ).toBe(0);
  });
});

it("administrator count rechecks provider revocation committed during its Auth lock wait", async () => {
  await withAdministrators(async ({ observer, a, b }) => {
    await a.execute(
      `begin;update auth.users set raw_app_meta_data=${mixed} where id='${ADMIN}';`,
    );
    await asAdmin(b, ACTOR);
    const pending = b.json(demote(ACTOR));
    await waitForLock(observer, b);
    await a.execute("commit;");
    expect(await pending).toEqual({ ok: false, code: "conflict" });
    await b.execute("rollback;");
  });
});

it("actor eligibility is rechecked after waiting for the membership advisory lock", async () => {
  await withAdministrators(async ({ observer, a, b }) => {
    await a.execute(
      "begin;select pg_advisory_xact_lock(72300320261107::bigint);",
    );
    await asAdmin(b, ACTOR);
    const pending = b.json(demote(ADMIN));
    await waitForLock(observer, b);
    await a.execute(
      `update auth.users set raw_app_meta_data=${mixed} where id='${ACTOR}';commit;`,
    );
    expect(await pending).toEqual({ ok: false, code: "forbidden" });
    await b.execute("rollback;");
  });
});

it("provider changes wait until an operation using the counted administrator commits", async () => {
  await withAdministrators(async ({ observer, a, b }) => {
    await asAdmin(a, ACTOR);
    expect(await a.json(demote(ACTOR))).toMatchObject({ ok: true });
    await b.execute("begin;");
    const pending = b.execute(
      `update auth.users set raw_app_meta_data=${mixed} where id='${ADMIN}';`,
    );
    await waitForLock(observer, b);
    await a.execute("commit;");
    await pending;
    await b.execute("rollback;");
  });
});

for (const operation of ["begin", "finalize"] as const)
  it(`trusted ${operation} rejects provider revocation committed during its actor lock wait`, async () => {
    await withAdministrators(async ({ observer, a, b }) => {
      await a.execute(
        `begin;update auth.users set raw_app_meta_data=${mixed} where id='${ACTOR}';`,
      );
      await b.execute("begin;set local role service_role;");
      const assetId = randomUUID();
      const call =
        operation === "begin"
          ? `public.begin_article_image_upload('${ACTOR}','${assetId}')`
          : `public.finalize_article_image_upload('${ACTOR}','${assetId}',repeat('a',64),12,2,2)`;
      const pending = b.json(call);
      await waitForLock(observer, b);
      await a.execute("commit;");
      expect(await pending).toEqual({ ok: false, code: "forbidden" });
      await b.execute("rollback;");
    });
  });

it("restores existing administrators after a race session exits", async () => {
  const observer = new DatabaseSession();
  const snapshot = `(select coalesce(jsonb_agg(jsonb_build_object('id',user_id,'active',active,'revokedAt',revoked_at) order by user_id),'[]') from public.memberships where role='administrator')`;
  await observer.ready();
  const prior = await observer.json(snapshot);
  try {
    await withAdministrators(async ({ a }) => {
      await a.close();
    });
    expect(await observer.json(snapshot)).toEqual(prior);
  } finally {
    // The regression itself must restore the baseline even while proving failure.
    await observer.execute(`update public.memberships m set active=p.active,revoked_at=p."revokedAt"
      from jsonb_to_recordset(${fixtureJson(prior)}) as p(id uuid,active boolean,"revokedAt" timestamptz)
      where m.user_id=p.id;`);
    await observer.close();
  }
});
