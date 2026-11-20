import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  DatabaseSession,
  waitForLock,
} from "../database-session/database-session";

it("serializes concurrent claims so one invitation creates one membership", async () => {
  const observer = new DatabaseSession();
  const a = new DatabaseSession();
  const b = new DatabaseSession();
  const actor = randomUUID();
  const invitee = randomUUID();
  const request = randomUUID();
  const email = `claim-${invitee}@bc.edu`;
  let prepared = false;
  try {
    await Promise.all([observer.ready(), a.ready(), b.ready()]);
    await observer.execute(`begin;
      insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values
        ('${actor}','inviter-${actor}@bc.edu',now(),'{"provider":"google"}'::jsonb),
        ('${invitee}','${email}',now(),'{"provider":"google"}'::jsonb);
      insert into public.profiles(auth_user_id,display_name,slug)
        values('${actor}','Race Inviter','race-inviter-${actor}');
      insert into public.memberships(user_id,role,active,approved_by,approved_at)
        values('${actor}','administrator',true,'${actor}',now());
      set local role authenticated;
      set local request.jwt.claim.sub='${actor}';
      select public.invite_staff('${request}'::uuid,
        '[{"email":"${email}","role":"author"}]'::jsonb);
      reset role; commit;`);
    prepared = true;
    const begin = `begin;set local role authenticated;set local request.jwt.claim.sub='${invitee}';`;
    await a.execute(begin);
    expect(await a.json<boolean>("public.claim_invitation()")).toBe(true);
    await b.execute(begin);
    const competing = b.json<boolean>("public.claim_invitation()");
    await waitForLock(observer, b);
    await a.execute("commit;");
    expect(await competing).toBe(false);
    await b.execute("commit;");
    expect(
      await observer.json<number>(
        `(select count(*) from public.memberships where user_id='${invitee}')`,
      ),
    ).toBe(1);
    expect(
      await observer.json<number>(
        `(select count(*) from public.audit_events where action='membership.claimed' and resource_id='${invitee}')`,
      ),
    ).toBe(1);
    expect(
      await observer.json<boolean>(
        `exists(select 1 from private.membership_invitations where email='${email}' and claimed_user_id='${invitee}')`,
      ),
    ).toBe(true);
  } finally {
    await Promise.all([a.close(), b.close()]);
    if (prepared)
      await observer.execute(`begin;
        delete from private.membership_write_receipts where actor_user_id='${actor}' or target_user_id='${invitee}';
        delete from public.audit_events where actor_user_id in ('${actor}','${invitee}')
          or (resource_id='${invitee}' and resource_type='membership');
        delete from private.membership_invitations where email='${email}';
        delete from public.memberships where user_id in ('${actor}','${invitee}');
        delete from public.profiles where auth_user_id in ('${actor}','${invitee}');
        delete from auth.users where id in ('${actor}','${invitee}');commit;`);
    await observer.close();
  }
});

it("serializes a claim already holding the staff lock before deactivation", async () => {
  const observer = new DatabaseSession();
  const claimant = new DatabaseSession();
  const administrator = new DatabaseSession();
  const actor = randomUUID();
  const invitee = randomUUID();
  const inviteRequest = randomUUID();
  const request = randomUUID();
  const email = `claim-first-${invitee}@bc.edu`;
  let prepared = false;
  try {
    await Promise.all([
      observer.ready(),
      claimant.ready(),
      administrator.ready(),
    ]);
    await observer.execute(`begin;
      insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values
        ('${actor}','admin-${actor}@bc.edu',now(),'{"provider":"google","providers":["google"]}'::jsonb),
        ('${invitee}','${email}',now(),'{"provider":"google","providers":["google"]}'::jsonb);
      insert into public.profiles(auth_user_id,display_name,slug) values
        ('${actor}','Race Admin','race-admin-${actor}'),
        ('${invitee}','Race Invitee','race-invitee-${invitee}');
      insert into public.memberships(user_id,role,active,approved_by,approved_at)
        values('${actor}','administrator',true,'${actor}',now());
      set local role authenticated; set local request.jwt.claim.sub='${actor}';
      select public.invite_staff('${inviteRequest}'::uuid,
        '[{"email":"${email}","role":"author"}]'::jsonb);
      reset role;
      insert into public.memberships(user_id,role,active,approved_by,approved_at)
        values('${invitee}','author',true,'${actor}',now());
      commit;`);
    prepared = true;
    await claimant.execute(
      `begin;set local role authenticated;set local request.jwt.claim.sub='${invitee}';`,
    );
    expect(await claimant.json<boolean>("public.claim_invitation()")).toBe(
      true,
    );
    await administrator.execute(
      `begin;set local role authenticated;set local request.jwt.claim.sub='${actor}';`,
    );
    const deactivation = administrator.json<{ ok: boolean }>(
      `public.deactivate_membership('${invitee}'::uuid,1,'${request}'::uuid)`,
    );
    await waitForLock(observer, administrator);
    await claimant.execute("commit;");
    expect(await deactivation).toMatchObject({ ok: true });
    await administrator.execute("commit;");
    expect(
      await observer.json<boolean>(
        `exists(select 1 from public.memberships where user_id='${invitee}' and not active)`,
      ),
    ).toBe(true);
  } finally {
    await Promise.all([claimant.close(), administrator.close()]);
    if (prepared) await cleanupStaffRace(observer, actor, invitee, email);
    await observer.close();
  }
});

it("retires a listing when deactivation holds the staff lock before claim", async () => {
  const observer = new DatabaseSession();
  const administrator = new DatabaseSession();
  const claimant = new DatabaseSession();
  const actor = randomUUID();
  const invitee = randomUUID();
  const inviteRequest = randomUUID();
  const request = randomUUID();
  const email = `deactivate-first-${invitee}@bc.edu`;
  let prepared = false;
  try {
    await Promise.all([
      observer.ready(),
      administrator.ready(),
      claimant.ready(),
    ]);
    await observer.execute(`begin;
      insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) values
        ('${actor}','admin-${actor}@bc.edu',now(),'{"provider":"google","providers":["google"]}'::jsonb),
        ('${invitee}','${email}',now(),'{"provider":"google","providers":["google"]}'::jsonb);
      insert into public.profiles(auth_user_id,display_name,slug) values
        ('${actor}','Race Admin','race-admin-${actor}'),
        ('${invitee}','Race Invitee','race-invitee-${invitee}');
      insert into public.memberships(user_id,role,active,approved_by,approved_at)
        values('${actor}','administrator',true,'${actor}',now());
      set local role authenticated; set local request.jwt.claim.sub='${actor}';
      select public.invite_staff('${inviteRequest}'::uuid,
        '[{"email":"${email}","role":"author"}]'::jsonb);
      reset role;
      insert into public.memberships(user_id,role,active,approved_by,approved_at)
        values('${invitee}','author',true,'${actor}',now());
      commit;`);
    prepared = true;
    await administrator.execute(
      `begin;set local role authenticated;set local request.jwt.claim.sub='${actor}';`,
    );
    expect(
      await administrator.json<{ ok: boolean }>(
        `public.deactivate_membership('${invitee}'::uuid,1,'${request}'::uuid)`,
      ),
    ).toMatchObject({ ok: true });
    await claimant.execute(
      `begin;set local role authenticated;set local request.jwt.claim.sub='${invitee}';`,
    );
    const claim = claimant.json<boolean>("public.claim_invitation()");
    await waitForLock(observer, claimant);
    await administrator.execute("commit;");
    expect(await claim).toBe(false);
    await claimant.execute("commit;");
    expect(
      await observer.json<boolean>(
        `exists(select 1 from public.memberships where user_id='${invitee}' and not active)`,
      ),
    ).toBe(true);
    expect(
      await observer.json<boolean>(
        `exists(select 1 from private.membership_invitations where email='${email}' and removed_at is not null and claimed_user_id is null)`,
      ),
    ).toBe(true);
  } finally {
    await Promise.all([administrator.close(), claimant.close()]);
    if (prepared) await cleanupStaffRace(observer, actor, invitee, email);
    await observer.close();
  }
});

async function cleanupStaffRace(
  observer: DatabaseSession,
  actor: string,
  invitee: string,
  email: string,
) {
  await observer.execute(`begin;
    delete from private.membership_write_receipts
      where actor_user_id in ('${actor}','${invitee}') or target_user_id='${invitee}';
    delete from public.audit_events where actor_user_id in ('${actor}','${invitee}')
      or resource_id in ('${actor}','${invitee}')
      or resource_id in (select id from private.membership_invitations where email='${email}');
    delete from private.membership_invitations where email='${email}';
    delete from public.memberships where user_id in ('${actor}','${invitee}');
    delete from public.profiles where auth_user_id in ('${actor}','${invitee}');
    delete from auth.users where id in ('${actor}','${invitee}');
    commit;`);
}
