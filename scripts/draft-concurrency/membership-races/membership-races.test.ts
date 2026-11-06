import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  DatabaseSession,
  waitForLock,
} from "../database-session/database-session";

const actor = "00000000-0000-0000-0000-000000000004";

it("serializes duplicate approval and stale deactivation on one membership", async () => {
  const observer = new DatabaseSession();
  const a = new DatabaseSession();
  const b = new DatabaseSession();
  const target = randomUUID();
  const approval = randomUUID();
  let prepared = false;
  try {
    await Promise.all([observer.ready(), a.ready(), b.ready()]);
    if (
      !(await observer.json<boolean>(
        `exists(select 1 from public.memberships where user_id='${actor}' and role='administrator' and active)`,
      ))
    )
      throw new Error("Synthetic seed administrator is unavailable.");
    await observer.execute(`insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data)
      values('${target}','membership-race-${target}@bc.edu',now(),'{"provider":"google"}'::jsonb);`);
    prepared = true;
    const begin = `begin;set local role authenticated;set local request.jwt.claim.sub='${actor}';`;
    const approve = `public.approve_membership('${target}'::uuid,'${approval}'::uuid,'author','Race Member')`;
    await a.execute(begin);
    expect(await a.json<{ ok: boolean }>(approve)).toMatchObject({ ok: true });
    await b.execute(begin);
    const replay = b.json<{ ok: boolean; replayed: boolean }>(approve);
    await waitForLock(observer, b);
    await a.execute("commit;");
    expect(await replay).toMatchObject({ ok: true, replayed: true });
    await b.execute("commit;");
    expect(
      await observer.json<number>(
        `(select count(*) from public.audit_events where resource_type='membership' and resource_id='${target}')`,
      ),
    ).toBe(1);

    await a.execute(begin);
    const first = `public.deactivate_membership('${target}'::uuid,1,'${randomUUID()}'::uuid)`;
    expect(await a.json<{ ok: boolean }>(first)).toMatchObject({ ok: true });
    await b.execute(begin);
    const stale = b.json<{ ok: boolean; code: string }>(
      `public.deactivate_membership('${target}'::uuid,1,'${randomUUID()}'::uuid)`,
    );
    await waitForLock(observer, b);
    await a.execute("commit;");
    expect(await stale).toEqual({ ok: false, code: "conflict" });
    await b.execute("commit;");
    expect(
      await observer.json<number>(
        `(select count(*) from public.audit_events where resource_type='membership' and resource_id='${target}')`,
      ),
    ).toBe(2);
  } finally {
    await Promise.all([a.close(), b.close()]);
    if (prepared)
      await observer.execute(`begin;
        delete from private.membership_write_receipts where target_user_id='${target}';
        delete from public.audit_events where resource_type='membership' and resource_id='${target}';
        delete from public.memberships where user_id='${target}';
        delete from public.profiles where auth_user_id='${target}';
        delete from auth.users where id='${target}';commit;`);
    await observer.close();
  }
});

it("prevents two administrators from demoting each other into lockout", async () => {
  const observer = new DatabaseSession();
  const a = new DatabaseSession();
  const b = new DatabaseSession();
  const second = randomUUID();
  let prepared = false;
  try {
    await Promise.all([observer.ready(), a.ready(), b.ready()]);
    const count =
      await observer.json<number>(`(select count(*) from public.memberships m
      join auth.users u on u.id=m.user_id
      join public.profiles p on p.auth_user_id=m.user_id and p.active
      where m.active and m.role='administrator' and u.email_confirmed_at is not null
        and u.email ~* '^[^@[:space:]]+@bc[.]edu$'
        and (u.raw_app_meta_data ->> 'provider'='google'
          or u.raw_app_meta_data -> 'providers' ? 'google'))`);
    if (count !== 1)
      throw new Error(
        "Last-admin race requires exactly one seeded administrator.",
      );
    await observer.execute(`begin;
      insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data)
        values('${second}','membership-admin-${second}@bc.edu',now(),'{"provider":"google"}'::jsonb);
      insert into public.profiles(auth_user_id,display_name,slug)
        values('${second}','Race Administrator','race-administrator-${second}');
      insert into public.memberships(user_id,role,active,approved_by,approved_at)
        values('${second}','administrator',true,'${actor}',now());commit;`);
    prepared = true;
    await a.execute(
      `begin;set local role authenticated;set local request.jwt.claim.sub='${actor}';`,
    );
    expect(
      await a.json<{ ok: boolean }>(
        `public.change_membership_role('${second}'::uuid,1,'${randomUUID()}'::uuid,'author')`,
      ),
    ).toMatchObject({ ok: true });
    await b.execute(
      `begin;set local role authenticated;set local request.jwt.claim.sub='${second}';`,
    );
    const competing = b.json<{ ok: boolean; code: string }>(
      `public.change_membership_role('${actor}'::uuid,1,'${randomUUID()}'::uuid,'author')`,
    );
    await waitForLock(observer, b);
    await a.execute("commit;");
    expect(await competing).toEqual({ ok: false, code: "forbidden" });
    await b.execute("commit;");
    expect(
      await observer.json<string>(
        `(select to_jsonb(role::text) from public.memberships where user_id='${actor}')`,
      ),
    ).toBe("administrator");
  } finally {
    await Promise.all([a.close(), b.close()]);
    if (prepared)
      await observer.execute(`begin;
        delete from private.membership_write_receipts where target_user_id='${second}';
        delete from public.audit_events where resource_type='membership' and resource_id='${second}';
        delete from public.memberships where user_id='${second}';
        delete from public.profiles where auth_user_id='${second}';
        delete from auth.users where id='${second}';commit;`);
    await observer.close();
  }
});
