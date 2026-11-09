import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { DraftWriteResult } from "../../../src/shared/articles/draft-contract/draft-contract";
import { ACTOR, beginAsActor } from "../draft-fixtures/draft-fixtures";
import { DRAFT } from "../draft-fixtures/draft-fixtures";
import { saveCommand, withSaveFixtures } from "../save-fixtures/save-fixtures";
import { waitForLock } from "../database-session/database-session";

async function reserveFinalizedAsset(
  observer: { execute(sql: string): Promise<string[]> },
  articleId: string,
) {
  const assetId = randomUUID();
  await observer.execute(`insert into public.media_assets
    (id,article_id,uploader_user_id,request_id,object_key,status,byte_size,width,height,sha256,finalized_at)
    values('${assetId}','${articleId}','${ACTOR}','${randomUUID()}',
      '${articleId}/${assetId}.webp','finalized',1234,12,8,repeat('a',64),now());`);
  return assetId;
}

function attach(articleId: string, assetId: string) {
  return `public.set_article_main_image('${articleId}',1,'${randomUUID()}',
    '${assetId}','Synthetic red image','The Gavel')`;
}

function remove(assetId: string) {
  return `public.mark_article_image_for_removal('${assetId}')`;
}

function saveBody(articleId: string, assetId: string) {
  return saveCommand(articleId, 1, randomUUID(), {
    ...DRAFT,
    content: {
      format: "gavel-draft",
      version: 2,
      document: {
        type: "doc",
        content: [
          {
            type: "image",
            attrs: { assetId, alt: "Synthetic red image", caption: null },
          },
        ],
      },
    },
  });
}

describe("main image attachment versus cleanup", () => {
  it("attachment wins its article lock and prevents a concurrent removal", async () => {
    await withSaveFixtures(async ({ observer, a, b, articleId }) => {
      const assetId = await reserveFinalizedAsset(observer, articleId);
      await beginAsActor(a);
      const attached = await a.json<DraftWriteResult>(
        attach(articleId, assetId),
      );
      expect(attached.ok).toBe(true);
      await beginAsActor(b);
      const pending = b.json(remove(assetId));
      await waitForLock(observer, b);
      await a.execute("commit;");
      expect(await pending).toEqual({ ok: false, code: "conflict" });
      await b.execute("commit;");
      expect(
        await observer.json<string>(
          `(select to_jsonb(status) from public.media_assets where id='${assetId}')`,
        ),
      ).toBe("finalized");
      expect(
        await observer.json<number>(
          `(select count(*) from private.article_revision_media_refs where asset_id='${assetId}')`,
        ),
      ).toBe(1);
    });
  });

  it("removal wins its article lock and prevents a concurrent attachment", async () => {
    await withSaveFixtures(async ({ observer, a, b, articleId }) => {
      const assetId = await reserveFinalizedAsset(observer, articleId);
      await beginAsActor(a);
      expect(await a.json(remove(assetId))).toMatchObject({ ok: true });
      await beginAsActor(b);
      const pending = b.json<DraftWriteResult>(attach(articleId, assetId));
      await waitForLock(observer, b);
      await a.execute("commit;");
      expect(await pending).toEqual({ ok: false, code: "invalid_input" });
      await b.execute("commit;");
      expect(
        await observer.json<string>(
          `(select to_jsonb(status) from public.media_assets where id='${assetId}')`,
        ),
      ).toBe("deleting");
      expect(
        await observer.json<number>(
          `(select count(*) from public.article_main_images where asset_id='${assetId}')`,
        ),
      ).toBe(0);
    });
  });
});

describe("body image save versus cleanup", () => {
  it("a committed body save retains the asset before removal can mark it", async () => {
    await withSaveFixtures(async ({ observer, a, b, articleId }) => {
      const assetId = await reserveFinalizedAsset(observer, articleId);
      await beginAsActor(a);
      expect(
        (await a.json<DraftWriteResult>(saveBody(articleId, assetId))).ok,
      ).toBe(true);
      await beginAsActor(b);
      const pending = b.json(remove(assetId));
      await waitForLock(observer, b);
      await a.execute("commit;");
      expect(await pending).toEqual({ ok: false, code: "conflict" });
      await b.execute("commit;");
      expect(
        await observer.json<number>(
          `(select count(*) from public.article_body_images where asset_id='${assetId}')`,
        ),
      ).toBe(1);
      expect(
        await observer.json<number>(
          `(select count(*) from private.article_revision_media_refs where asset_id='${assetId}')`,
        ),
      ).toBe(1);
    });
  });

  it("a removal mark prevents a delayed body save", async () => {
    await withSaveFixtures(async ({ observer, a, b, articleId }) => {
      const assetId = await reserveFinalizedAsset(observer, articleId);
      await beginAsActor(a);
      expect(await a.json(remove(assetId))).toMatchObject({ ok: true });
      await beginAsActor(b);
      const pending = b.json<DraftWriteResult>(saveBody(articleId, assetId));
      await waitForLock(observer, b);
      await a.execute("commit;");
      expect(await pending).toEqual({ ok: false, code: "invalid_input" });
      await b.execute("commit;");
      expect(
        await observer.json<number>(
          `(select count(*) from public.article_body_images where asset_id='${assetId}')`,
        ),
      ).toBe(0);
    });
  });
});
