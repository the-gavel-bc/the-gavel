import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ACTOR } from "../draft-fixtures/draft-fixtures";
import { withSaveFixtures } from "../save-fixtures/save-fixtures";
import {
  type DatabaseSession,
  waitForLock,
} from "../database-session/database-session";

function finalize(assetId: string) {
  return `public.finalize_article_image_upload('${ACTOR}','${assetId}',repeat('a',64),12,2,2)`;
}
function begin(assetId: string) {
  return `public.begin_article_image_upload('${ACTOR}','${assetId}')`;
}
async function withAsset(
  observer: DatabaseSession,
  articleId: string,
  run: (assetId: string) => Promise<void>,
) {
  const assetId = randomUUID();
  const key = `${articleId}/${assetId}.webp`;
  await observer.execute(`insert into public.media_assets
    (id,article_id,uploader_user_id,request_id,object_key,status)
    values('${assetId}','${articleId}','${ACTOR}','${randomUUID()}','${key}','pending');
    insert into storage.objects(bucket_id,name,metadata)
    values('article-media','${key}','{"mimetype":"image/webp","size":12}');`);
  try {
    await run(assetId);
  } finally {
    await observer.execute(`select set_config('storage.allow_delete_query','true',false);
      delete from storage.objects where bucket_id='article-media' and name='${key}';`);
  }
}

describe("upload begin and finalize share article-before-asset locks", () => {
  it("begin finishes while finalize waits behind its article lock", async () => {
    await withSaveFixtures(async ({ observer, a, b, articleId }) => {
      await withAsset(observer, articleId, async (assetId) => {
        await a.execute(
          `begin; select id from public.articles where id='${articleId}' for update;`,
        );
        await b.execute("begin; set local role service_role;");
        const pending = b.json(finalize(assetId));
        await waitForLock(observer, b);
        // An asset-first finalizer holds the asset here and deadlocks this begin.
        await a.execute("set local role service_role;");
        expect(await a.json(begin(assetId))).toEqual({
          ok: true,
          assetId,
          replayed: false,
        });
        await a.execute("commit;");
        expect(await pending).toEqual({ ok: true, assetId, replayed: false });
        await b.execute("commit;");
        expect(
          await observer.json(
            `(select to_jsonb(status) from public.media_assets where id='${assetId}')`,
          ),
        ).toBe("finalized");
      });
    });
  });

  it("finalize finishes while begin waits behind its article lock", async () => {
    await withSaveFixtures(async ({ observer, a, b, articleId }) => {
      await withAsset(observer, articleId, async (assetId) => {
        await a.execute(
          `begin; select id from public.articles where id='${articleId}' for update;`,
        );
        await b.execute("begin; set local role service_role;");
        const pending = b.json(begin(assetId));
        await waitForLock(observer, b);
        await a.execute("set local role service_role;");
        expect(await a.json(finalize(assetId))).toEqual({
          ok: true,
          assetId,
          replayed: false,
        });
        await a.execute("commit;");
        expect(await pending).toEqual({ ok: false, code: "conflict" });
        await b.execute("commit;");
        expect(
          await observer.json(
            `(select to_jsonb(status) from public.media_assets where id='${assetId}')`,
          ),
        ).toBe("finalized");
      });
    });
  });

  it("fails closed when the asset disappears during its asset wait", async () => {
    await withSaveFixtures(async ({ observer, a, b, articleId }) => {
      await withAsset(observer, articleId, async (assetId) => {
        await a.execute(
          `begin; select id from public.media_assets where id='${assetId}' for update;`,
        );
        await b.execute("begin; set local role service_role;");
        const pending = b.json(finalize(assetId));
        await waitForLock(observer, b);
        await a.execute(
          `delete from public.media_assets where id='${assetId}'; commit;`,
        );
        expect(await pending).toEqual({ ok: false, code: "not_found" });
        await b.execute("commit;");
      });
    });
  });

  for (const missing of ["asset", "article"] as const) {
    it(`fails closed when the ${missing} disappears during its article wait`, async () => {
      await withSaveFixtures(async ({ observer, a, b, articleId }) => {
        await withAsset(observer, articleId, async (assetId) => {
          await a.execute(
            `begin; select id from public.articles where id='${articleId}' for update;`,
          );
          await b.execute("begin; set local role service_role;");
          const pending = b.json(finalize(assetId));
          await waitForLock(observer, b);
          await a.execute(
            `delete from public.media_assets where id='${assetId}';`,
          );
          if (missing === "article") {
            await a.execute(`delete from public.article_revisions where article_id='${articleId}';
              delete from public.articles where id='${articleId}';
              delete from private.media_cleanup_ledger where article_id='${articleId}';
              delete from private.media_key_registry where article_id='${articleId}';
              delete from private.article_id_registry where article_id='${articleId}';`);
          }
          await a.execute("commit;");
          expect(await pending).toEqual({ ok: false, code: "not_found" });
          await b.execute("commit;");
          expect(
            await observer.json(
              `(select count(*) from public.media_assets where id='${assetId}')`,
            ),
          ).toBe(0);
        });
      });
    });
  }
});

it("cancellation commits before a waiting finalizer and leaves the upload fenced", async () => {
  await withSaveFixtures(async ({ observer, a, b, articleId }) => {
    await withAsset(observer, articleId, async (assetId) => {
      await observer.execute(
        `update public.media_assets set status='uploading' where id='${assetId}';`,
      );
      await a.execute(
        `begin; set local role authenticated; select set_config('request.jwt.claim.sub','${ACTOR}',true);`,
      );
      expect(
        await a.json(`public.mark_article_image_for_removal('${assetId}')`),
      ).toEqual({ ok: true, assetId, replayed: false });
      await b.execute("begin; set local role service_role;");
      const pending = b.json(finalize(assetId));
      await waitForLock(observer, b);
      await a.execute("commit;");
      expect(await pending).toEqual({ ok: false, code: "conflict" });
      await b.execute("commit;");
      expect(
        await observer.json(
          `(select to_jsonb(status) from public.media_assets where id='${assetId}')`,
        ),
      ).toBe("deleting");
    });
  });
});
