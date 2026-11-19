import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { DraftWriteResult } from "../../../src/shared/articles/draft-contract/draft-contract";
import { ACTOR, beginAsActor } from "../draft-fixtures/draft-fixtures";
import { withSaveFixtures } from "../save-fixtures/save-fixtures";
import { waitForLock } from "../database-session/database-session";

async function oldAsset(
  observer: { execute(sql: string): Promise<string[]> },
  articleId: string,
  status = "finalized",
) {
  const assetId = randomUUID();
  const finished = status === "finalized";
  await observer.execute(`insert into public.media_assets
    (id,article_id,uploader_user_id,request_id,object_key,status${
      finished ? ",byte_size,width,height,sha256,finalized_at" : ""
    },created_at)
    values('${assetId}','${articleId}','${ACTOR}','${randomUUID()}',
      '${articleId}/${assetId}.webp','${status}'${
        finished ? ",1234,12,8,repeat('a',64),now()-interval '10 days'" : ""
      },now()-interval '10 days');`);
  return assetId;
}
const claim = `(select coalesce(jsonb_agg(asset_id),'[]'::jsonb)
  from public.claim_expired_unused_uploads(interval '7 days',25))`;
const attach = (articleId: string, assetId: string) =>
  `public.set_article_main_image('${articleId}',1,'${randomUUID()}',
    '${assetId}','Synthetic red image','The Gavel')`;
const status = (observer: { json<T>(sql: string): Promise<T> }, id: string) =>
  observer.json<string>(
    `(select to_jsonb(status) from public.media_assets where id='${id}')`,
  );

describe("expiry claim versus attachment", () => {
  it("an attachment that holds the article lock makes the claim skip the image", async () => {
    await withSaveFixtures(async ({ observer, a, b, articleId }) => {
      const assetId = await oldAsset(observer, articleId);
      await beginAsActor(a);
      const attached = await a.json<DraftWriteResult>(
        attach(articleId, assetId),
      );
      expect(attached.ok).toBe(true);
      await b.execute("begin;");
      expect(await b.json<string[]>(claim)).toEqual([]);
      await b.execute("commit;");
      await a.execute("commit;");
      expect(await status(observer, assetId)).toBe("finalized");
    });
  });

  it("a claim that wins the article lock keeps a concurrent attachment from landing", async () => {
    await withSaveFixtures(async ({ observer, a, b, articleId }) => {
      const assetId = await oldAsset(observer, articleId);
      await b.execute("begin;");
      expect(await b.json<string[]>(claim)).toEqual([assetId]);
      await beginAsActor(a);
      const pending = a.json<DraftWriteResult>(attach(articleId, assetId));
      await waitForLock(observer, a);
      await b.execute("commit;");
      expect(await pending).toEqual({ ok: false, code: "invalid_input" });
      await a.execute("commit;");
      expect(await status(observer, assetId)).toBe("deleting");
      expect(
        await observer.json<number>(
          `(select count(*) from public.article_main_images where asset_id='${assetId}')`,
        ),
      ).toBe(0);
    });
  });

  it("an unfinished upload past a day is claimed, a fresh one is not", async () => {
    await withSaveFixtures(async ({ observer, b, articleId }) => {
      const stale = await oldAsset(observer, articleId, "uploading");
      const fresh = randomUUID();
      await observer.execute(`insert into public.media_assets
        (id,article_id,uploader_user_id,request_id,object_key,status)
        values('${fresh}','${articleId}','${ACTOR}','${randomUUID()}','${articleId}/${fresh}.webp','uploading');`);
      await b.execute("begin;");
      expect(await b.json<string[]>(claim)).toEqual([stale]);
      await b.execute("commit;");
    });
  });

  it("two simultaneous begins of one upload serialize: one starts it, the other replays", async () => {
    await withSaveFixtures(async ({ observer, a, b, articleId }) => {
      const assetId = randomUUID();
      await observer.execute(`insert into public.media_assets
        (id,article_id,uploader_user_id,request_id,object_key,status)
        values('${assetId}','${articleId}','${ACTOR}','${randomUUID()}','${articleId}/${assetId}.webp','pending');`);
      const begin = `public.begin_article_image_upload('${ACTOR}','${assetId}')`;
      await a.execute("begin;");
      expect(
        await a.json<{ ok: boolean; replayed: boolean }>(begin),
      ).toMatchObject({
        ok: true,
        replayed: false,
      });
      await b.execute("begin;");
      const pending = b.json<{ ok: boolean; replayed: boolean }>(begin);
      await waitForLock(observer, b);
      await a.execute("commit;");
      expect(await pending).toMatchObject({ ok: true, replayed: true });
      await b.execute("commit;");
      expect(await status(observer, assetId)).toBe("uploading");
    });
  });
});
