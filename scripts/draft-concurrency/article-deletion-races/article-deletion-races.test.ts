import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  type DatabaseSession,
  waitForLock,
} from "../database-session/database-session";
import {
  ADMIN,
  beginAsAdmin,
  withSaveFixtures,
} from "../save-fixtures/save-fixtures";
async function enableSyntheticHealth(observer: DatabaseSession) {
  await observer.execute(`create temp table saved_cleanup_health as select last_healthy_at from private.media_cleanup_runtime where id=true and run_token is null;
    do $$ begin if not exists(select 1 from saved_cleanup_health) then raise exception 'Cleanup worker active'; end if; end $$;
    update private.media_cleanup_runtime set last_healthy_at='2099-01-01T00:00:00Z' where id=true;`);
}
async function restoreSyntheticHealth(observer: DatabaseSession) {
  await observer.execute(`update private.media_cleanup_runtime set last_healthy_at=(select last_healthy_at from saved_cleanup_health)
    where id=true and last_healthy_at='2099-01-01T00:00:00Z'; drop table saved_cleanup_health;`);
}
it("deletion and slug allocation serialize without reusing a deleted URL", async () => {
  await withSaveFixtures(async ({ observer, a, b, articleId }) => {
    const slug = await observer.json<string>(
      `(select to_jsonb(slug) from public.articles where id='${articleId}')`,
    );
    if (slug !== "synthetic-race-draft")
      throw new Error(
        "Synthetic slug already in use; refusing to alter other reservations.",
      );
    await enableSyntheticHealth(observer);
    try {
      await observer.execute(
        `update public.articles set status='archived',published_at=now(),archived_at=now() where id='${articleId}';`,
      );
      await beginAsAdmin(a);
      expect(
        await a.json(
          `public.delete_archived_article('${articleId}',1,'${randomUUID()}',true)`,
        ),
      ).toMatchObject({ ok: true });
      await b.execute("begin;");
      const allocation = b.json<string>(
        `to_jsonb(private.allocate_article_slug('Synthetic Race Draft'))`,
      );
      await waitForLock(observer, b);
      await a.execute("commit;");
      expect(await allocation).not.toBe(slug);
      await b.execute("commit;");
    } finally {
      await Promise.all([a.close(), b.close()]);
      await observer.execute(`delete from private.retired_article_ids where article_id='${articleId}';
    delete from private.article_id_registry where article_id='${articleId}';
    delete from private.article_deletion_receipts where actor_user_id='${ADMIN}';
    delete from private.retired_article_slugs where slug='${slug}';`);
      await restoreSyntheticHealth(observer);
    }
  });
});

it("a concurrent restoration makes deletion reject the stale state", async () => {
  await withSaveFixtures(async ({ observer, a, b, articleId }) => {
    await enableSyntheticHealth(observer);
    try {
      await observer.execute(
        `update public.articles set status='archived',published_at=now(),archived_at=now() where id='${articleId}';`,
      );
      await a.execute(
        `begin; update public.articles set status='published',archived_at=null,edit_version=edit_version+1 where id='${articleId}';`,
      );
      await beginAsAdmin(b);
      const deletion = b.json(
        `public.delete_archived_article('${articleId}',1,'${randomUUID()}',true)`,
      );
      await waitForLock(observer, b);
      await a.execute("commit;");
      expect(await deletion).toEqual({ ok: false, code: "conflict" });
      await b.execute("commit;");
    } finally {
      await Promise.all([a.close(), b.close()]);
      await restoreSyntheticHealth(observer);
    }
  });
});

it("deletion fails promptly while an upload finalizer holds an asset lock", async () => {
  await withSaveFixtures(async ({ observer, a, b, articleId }) => {
    await enableSyntheticHealth(observer);
    const asset = randomUUID();
    try {
      await observer.execute(`begin; update public.articles set status='archived',published_at=now(),archived_at=now() where id='${articleId}';
        insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status)
        values('${asset}','${articleId}','${ADMIN}','${randomUUID()}','${articleId}/${asset}.webp','uploading');commit;`);
      await a.execute(
        `begin; select id from public.media_assets where id='${asset}' for update;`,
      );
      await beginAsAdmin(b);
      expect(
        await b.json(
          `public.delete_archived_article('${articleId}',1,'${randomUUID()}',true)`,
        ),
      ).toEqual({ ok: false, code: "unavailable" });
      await b.execute("commit;");
      await a.execute("commit;");
      expect(
        await observer.json(
          `exists(select 1 from public.articles where id='${articleId}')`,
        ),
      ).toBe(true);
    } finally {
      await Promise.all([a.close(), b.close()]);
      await observer.execute(`delete from public.media_assets where id='${asset}';
        delete from private.media_cleanup_ledger where asset_id='${asset}';
        delete from private.media_key_registry where asset_id='${asset}';`);
      await restoreSyntheticHealth(observer);
    }
  });
});

it("deletion invalidates a concurrent stale homepage selection save", async () => {
  await withSaveFixtures(async ({ observer, a, b, articleId }) => {
    const empty = await observer.json<boolean>(
      `not exists(select 1 from public.homepage_selections) and exists(select 1 from public.homepage_curation where edit_version=1)`,
    );
    if (!empty)
      throw new Error(
        "Homepage curation is not empty; refusing synthetic mutation.",
      );
    const slug = await observer.json<string>(
      `(select to_jsonb(slug) from public.articles where id='${articleId}')`,
    );
    if (slug !== "synthetic-race-draft")
      throw new Error("Synthetic slug already in use; refusing cleanup.");
    await enableSyntheticHealth(observer);
    try {
      await observer.execute(`begin; update public.articles set status='archived',published_at=now(),archived_at=now() where id='${articleId}';
        insert into public.homepage_selections(group_name,position,article_id) values('lead',1,'${articleId}');commit;`);
      await beginAsAdmin(a);
      expect(
        await a.json(
          `public.delete_archived_article('${articleId}',1,'${randomUUID()}',true)`,
        ),
      ).toMatchObject({ ok: true });
      await beginAsAdmin(b);
      const save = b.json(
        `public.save_homepage_selections(1,'${randomUUID()}',null,'{}'::uuid[],'{}'::uuid[])`,
      );
      await waitForLock(observer, b);
      await a.execute("commit;");
      expect(await save).toEqual({ ok: false, code: "conflict" });
      await b.execute("commit;");
    } finally {
      await Promise.all([a.close(), b.close()]);
      await observer.execute(`delete from private.retired_article_ids where article_id='${articleId}';
        delete from private.article_id_registry where article_id='${articleId}';
        delete from private.article_deletion_receipts where actor_user_id='${ADMIN}';
        delete from private.retired_article_slugs where slug='synthetic-race-draft';
        update public.homepage_curation set edit_version=1 where id='00000000-0000-0000-0000-000000000001' and edit_version=2
          and not exists(select 1 from public.homepage_selections);
        delete from public.homepage_selections where article_id='${articleId}';`);
      await restoreSyntheticHealth(observer);
    }
  });
});
