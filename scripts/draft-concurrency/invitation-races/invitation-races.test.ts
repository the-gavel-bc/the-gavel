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
