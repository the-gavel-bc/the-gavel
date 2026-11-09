import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ACTOR } from "../draft-fixtures/draft-fixtures";
import { ADMIN, withSaveFixtures } from "../save-fixtures/save-fixtures";
import { waitForLock } from "../database-session/database-session";

describe("trusted media operations recheck authority after waits", () => {
  for (const operation of ["begin", "finalize", "complete"] as const) {
    for (const change of ["demote", "membership", "profile"] as const) {
      it(`${operation} rejects ${change} committed ahead of its lock`, async () => {
        await withSaveFixtures(async ({ observer, a, b, articleId }) => {
          const assetId = randomUUID();
          const key = `${articleId}/${assetId}.webp`;
          await observer.execute(`insert into public.media_assets
            (id,article_id,uploader_user_id,request_id,object_key,status)
            values('${assetId}','${articleId}','${ACTOR}','${randomUUID()}','${key}','${operation === "complete" ? "deleting" : "pending"}');
            insert into storage.objects(bucket_id,name,metadata)
            values('article-media','${key}','{"mimetype":"image/webp","size":12}');`);
          if (operation === "complete")
            await observer.execute(
              `select set_config('storage.allow_delete_query','true',false); delete from storage.objects where bucket_id='article-media' and name='${key}';`,
            );
          try {
            await a.execute(`begin;
              ${change === "profile" ? `update public.profiles set active=false where auth_user_id='${ADMIN}';` : `update public.memberships set ${change === "demote" ? "role='author'" : "active=false"} where user_id='${ADMIN}';`}
              select id from public.${operation === "begin" ? "articles" : "media_assets"}
              where id='${operation === "begin" ? articleId : assetId}' for update;`);
            await b.execute("begin; set local role service_role;");
            const pending = b.json(
              operation === "begin"
                ? `public.begin_article_image_upload('${ADMIN}','${assetId}')`
                : operation === "complete"
                  ? `public.complete_article_image_removal('${ADMIN}','${assetId}')`
                  : `public.finalize_article_image_upload('${ADMIN}','${assetId}',repeat('a',64),12,2,2)`,
            );
            await waitForLock(observer, b);
            await a.execute("commit;");
            expect(await pending).toEqual({
              ok: false,
              code: change === "demote" ? "not_found" : "forbidden",
            });
            await b.execute("commit;");
            expect(
              await observer.json(
                `(select to_jsonb(status) from public.media_assets where id='${assetId}')`,
              ),
            ).toBe(operation === "complete" ? "deleting" : "pending");
          } finally {
            await a.execute("rollback;");
            await b.execute("rollback;");
            await observer.execute(`select set_config('storage.allow_delete_query','true',false);
              delete from storage.objects where bucket_id='article-media' and name='${key}';`);
          }
        });
      });
    }
  }
});
