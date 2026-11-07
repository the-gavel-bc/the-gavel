import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { ACTOR, PROFILE, beginAsActor } from "../draft-fixtures/draft-fixtures";
import { fixtureJson, waitForLock } from "../database-session/database-session";
import {
  ADMIN,
  beginAsAdmin,
  withSaveFixtures,
} from "../save-fixtures/save-fixtures";

it("own and administrator edits serialize and reject the stale version", async () => {
  await withSaveFixtures(async ({ observer, a, b }) => {
    try {
      await beginAsActor(a);
      expect(
        await a.json<{ ok: boolean }>(
          `public.save_own_public_profile(1,'${randomUUID()}'::uuid,'Race Author',null)`,
        ),
      ).toMatchObject({ ok: true });
      await beginAsAdmin(b);
      const stale = b.json<{ ok: boolean; code: string }>(
        `public.save_contributor_profile('${PROFILE}'::uuid,1,'${randomUUID()}'::uuid,'Admin Edit',null)`,
      );
      await waitForLock(observer, b);
      await a.execute("commit;");
      expect(await stale).toEqual({ ok: false, code: "conflict" });
      await b.execute("commit;");
      expect(
        await observer.json(`(select jsonb_build_object('name',display_name,'version',edit_version)
        from public.profiles where id='${PROFILE}')`),
      ).toEqual({ name: "Race Author", version: 2 });
    } finally {
      await Promise.all([a.close(), b.close()]);
      await observer.execute(
        `delete from private.profile_write_receipts where actor_user_id in ('${ACTOR}','${ADMIN}');`,
      );
    }
  });
});

it("own save rechecks identity after a concurrent revocation", async () => {
  await withSaveFixtures(async ({ observer, a, b }) => {
    await a.execute(
      `begin;update auth.users set email_confirmed_at=null where id='${ACTOR}';`,
    );
    await beginAsActor(b);
    const save = b.json<{ ok: boolean; code: string }>(
      `public.save_own_public_profile(1,'${randomUUID()}'::uuid,'Denied Author',null)`,
    );
    await waitForLock(observer, b);
    await a.execute("commit;");
    expect(await save).toEqual({ ok: false, code: "forbidden" });
    await b.execute("commit;");
  });
});

it("own rename waiting on publication retains the newly frozen slug", async () => {
  await withSaveFixtures(async ({ observer, a, b, articleId }) => {
    const asset = randomUUID();
    const content = {
      format: "gavel-draft",
      version: 1,
      document: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Ready story" }],
          },
        ],
      },
    };
    try {
      await observer.execute(`begin;
        update public.articles set content=${fixtureJson(content)} where id='${articleId}';
        insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,byte_size,width,height,sha256,finalized_at)
          values('${asset}','${articleId}','${ACTOR}','${randomUUID()}','profile-race/${asset}.webp','finalized',1234,120,90,repeat('d',64),now());
        insert into public.article_main_images(article_id,asset_id,alt_text,credit)
          values('${articleId}','${asset}','Race image','The Gavel');commit;`);
      await beginAsActor(a);
      expect(
        await a.json<{ ok: boolean }>(
          `public.publish_article('${articleId}'::uuid,1,'${randomUUID()}'::uuid)`,
        ),
      ).toMatchObject({ ok: true });
      await beginAsActor(b);
      const renamed = b.json<{ ok: boolean; slug: string }>(
        `public.save_own_public_profile(1,'${randomUUID()}'::uuid,'Published Race Author',null)`,
      );
      await waitForLock(observer, b);
      await a.execute("commit;");
      expect(await renamed).toMatchObject({
        ok: true,
        slug: "synthetic-race-author",
      });
      await b.execute("commit;");
    } finally {
      await Promise.all([a.close(), b.close()]);
      await observer.execute(
        `delete from private.profile_write_receipts where actor_user_id='${ACTOR}';`,
      );
    }
  });
});
