import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { ACTOR, SECTION } from "../draft-fixtures/draft-fixtures";
import { fixtureJson, waitForLock } from "../database-session/database-session";
import {
  ADMIN,
  beginAsAdmin,
  withSaveFixtures,
} from "../save-fixtures/save-fixtures";

it("publication and section deactivation serialize without invalidating live content", async () => {
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
    await observer.execute(`begin;
      update public.articles set content=${fixtureJson(content)} where id='${articleId}';
      insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,byte_size,width,height,sha256,finalized_at)
        values('${asset}','${articleId}','${ACTOR}','${randomUUID()}','taxonomy-race/${asset}.webp','finalized',1234,120,90,repeat('d',64),now());
      insert into public.article_main_images(article_id,asset_id,alt_text,credit)
        values('${articleId}','${asset}','Race image','The Gavel');commit;`);
    await beginAsAdmin(a);
    expect(
      await a.json<{ ok: boolean }>(
        `public.publish_article('${articleId}'::uuid,1,'${randomUUID()}'::uuid)`,
      ),
    ).toMatchObject({ ok: true });
    await beginAsAdmin(b);
    const deactivation = b.json<{ ok: boolean; code: string }>(
      `public.update_section_taxonomy('${SECTION}'::uuid,1,'${randomUUID()}'::uuid,'Synthetic Race Section',0,false)`,
    );
    await waitForLock(observer, b);
    await a.execute("commit;");
    expect(await deactivation).toEqual({ ok: false, code: "conflict" });
    await b.execute("commit;");
    expect(
      await observer.json<boolean>(
        `(select active from public.sections where id='${SECTION}')`,
      ),
    ).toBe(true);
  });
});

it("publication observes a section deactivated while it waited", async () => {
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
          values('${asset}','${articleId}','${ACTOR}','${randomUUID()}','taxonomy-race/${asset}.webp','finalized',1234,120,90,repeat('d',64),now());
        insert into public.article_main_images(article_id,asset_id,alt_text,credit)
          values('${articleId}','${asset}','Race image','The Gavel');commit;`);
      await beginAsAdmin(a);
      expect(
        await a.json<{ ok: boolean }>(
          `public.update_section_taxonomy('${SECTION}'::uuid,1,'${randomUUID()}'::uuid,'Synthetic Race Section',0,false)`,
        ),
      ).toMatchObject({ ok: true });
      await beginAsAdmin(b);
      const publication = b.json<{ ok: boolean; code: string }>(
        `public.publish_article('${articleId}'::uuid,1,'${randomUUID()}'::uuid)`,
      );
      await waitForLock(observer, b);
      await a.execute("commit;");
      expect(await publication).toEqual({ ok: false, code: "invalid_input" });
      await b.execute("commit;");
    } finally {
      await Promise.all([a.close(), b.close()]);
      await observer.execute(
        `delete from private.taxonomy_write_receipts where actor_user_id='${ADMIN}';`,
      );
    }
  });
});
