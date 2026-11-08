import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  DatabaseSession,
  waitForLock,
} from "../database-session/database-session";

it("a deactivation racing publication cannot leave a published inactive owner", async () => {
  const observer = new DatabaseSession();
  const a = new DatabaseSession();
  const b = new DatabaseSession();
  const actor = randomUUID();
  const guest = randomUUID();
  const section = randomUUID();
  const article = randomUUID();
  let prepared = false;
  try {
    await Promise.all([observer.ready(), a.ready(), b.ready()]);
    await observer.execute(`begin;
      insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data)
        values('${actor}','contributor-race-${actor}@bc.edu',now(),'{"provider":"google"}'::jsonb);
      insert into public.profiles(id,auth_user_id,display_name,slug)
        values('${actor}','${actor}','Race Admin','race-admin-${actor}'),
          ('${guest}',null,'Race Guest','race-guest-${guest}');
      insert into public.memberships(user_id,role,active,approved_by,approved_at)
        values('${actor}','administrator',true,'${actor}',now());
      insert into public.sections(id,name,slug)
        values('${section}','Race section','race-section-${section}');
      insert into public.articles(id,owner_profile_id,section_id,title,slug)
        values('${article}','${guest}','${section}','Race article','race-article-${article}');commit;`);
    prepared = true;
    await a.execute(
      `begin;set local role authenticated;set local request.jwt.claim.sub='${actor}';`,
    );
    expect(
      await a.json<{ ok: boolean }>(
        `public.deactivate_contributor_profile('${guest}'::uuid,1,'${randomUUID()}'::uuid)`,
      ),
    ).toMatchObject({ ok: true });
    await b.execute("begin;");
    const publication =
      b.execute(`update public.articles set status='published',published_at=now()
      where id='${article}';`);
    await waitForLock(observer, b);
    await a.execute("commit;");
    await expect(publication).rejects.toThrow();
    expect(
      await observer.json<string>(
        `(select to_jsonb(status::text) from public.articles where id='${article}')`,
      ),
    ).toBe("draft");
  } finally {
    await Promise.all([a.close(), b.close()]);
    if (prepared)
      await observer.execute(`begin;
      delete from private.profile_write_receipts where actor_user_id='${actor}';
      delete from public.audit_events where actor_user_id='${actor}';
      delete from public.articles where id='${article}';
      delete from private.article_id_registry where article_id='${article}';
      delete from public.sections where id='${section}';
      delete from public.memberships where user_id='${actor}';
      delete from public.profiles where id in ('${actor}','${guest}');
      delete from auth.users where id='${actor}';commit;`);
    await observer.close();
  }
});

it("crediting a contributor waits for a concurrent rename before freezing its slug", async () => {
  const observer = new DatabaseSession();
  const a = new DatabaseSession();
  const b = new DatabaseSession();
  const actor = randomUUID();
  const guest = randomUUID();
  const section = randomUUID();
  const article = randomUUID();
  let prepared = false;
  try {
    await Promise.all([observer.ready(), a.ready(), b.ready()]);
    await observer.execute(`begin;
      insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data)
        values('${actor}','credit-race-${actor}@bc.edu',now(),'{"provider":"google"}'::jsonb);
      insert into public.profiles(id,auth_user_id,display_name,slug) values
        ('${actor}','${actor}','Race Admin','race-admin-${actor}'),
        ('${guest}',null,'Race Guest','race-guest-${guest}');
      insert into public.memberships(user_id,role,active,approved_by,approved_at)
        values('${actor}','administrator',true,'${actor}',now());
      insert into public.sections(id,name,slug) values('${section}','Race section','race-section-${section}');
      insert into public.articles(id,owner_profile_id,section_id,title,slug,status,published_at)
        values('${article}','${actor}','${section}','Race article','race-article-${article}','published',now());commit;`);
    prepared = true;
    await a.execute(
      `begin;set local role authenticated;set local request.jwt.claim.sub='${actor}';`,
    );
    expect(
      await a.json<{ ok: boolean }>(
        `public.save_contributor_profile('${guest}'::uuid,1,'${randomUUID()}'::uuid,'New Race Name',null)`,
      ),
    ).toMatchObject({ ok: true });
    await b.execute("begin;");
    const credit =
      b.execute(`insert into public.article_contributors(article_id,profile_id,contribution_role)
      values('${article}','${guest}','writer');`);
    await waitForLock(observer, b);
    await a.execute("commit;");
    await credit;
    await b.execute("commit;");
    expect(
      await observer.json(`(select jsonb_build_object('slug',slug,'frozen',slug_frozen)
      from public.profiles where id='${guest}')`),
    ).toEqual({ slug: "new-race-name", frozen: true });
  } finally {
    await Promise.all([a.close(), b.close()]);
    if (prepared)
      await observer.execute(`begin;
      delete from private.profile_write_receipts where actor_user_id='${actor}';
      delete from public.audit_events where actor_user_id='${actor}';
      delete from public.article_contributors where article_id='${article}';
      delete from public.articles where id='${article}';
      delete from private.article_id_registry where article_id='${article}';
      delete from public.sections where id='${section}';
      delete from public.memberships where user_id='${actor}';
      delete from public.profiles where id in ('${actor}','${guest}');
      delete from auth.users where id='${actor}';commit;`);
    await observer.close();
  }
});
