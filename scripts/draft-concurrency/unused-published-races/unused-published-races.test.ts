import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { ACTOR, DRAFT, beginAsActor } from "../draft-fixtures/draft-fixtures";
import { saveCommand, withSaveFixtures } from "../save-fixtures/save-fixtures";
import { waitForLock } from "../database-session/database-session";
import type { DraftWriteResult } from "../../../src/shared/articles/draft-contract/draft-contract";

it.each(["save", "cleanup"] as const)(
  "published %s wins its article lock and rejects the competing reference change",
  async (winner) => {
    await withSaveFixtures(async ({ observer, a, b, articleId }) => {
      const assetId = randomUUID();
      const mainAssetId = randomUUID();
      await observer.execute(`update public.articles set status='published',published_at=now(),
      content='{"format":"gavel-draft","version":1,"document":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Published story"}]}]}}'
      where id='${articleId}';
      insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,byte_size,width,height,sha256,finalized_at)
      values('${assetId}','${articleId}','${ACTOR}','${randomUUID()}','${articleId}/${assetId}.webp','finalized',1234,12,8,repeat('a',64),now()),
      ('${mainAssetId}','${articleId}','${ACTOR}','${randomUUID()}','${articleId}/${mainAssetId}.webp','finalized',1234,12,8,repeat('b',64),now());
      insert into public.article_main_images(article_id,asset_id,alt_text,credit)
      values('${articleId}','${mainAssetId}','Newsroom','The Gavel');`);
      const mark = `public.mark_article_image_for_removal('${assetId}')`;
      const save = saveCommand(articleId, 1, randomUUID(), {
        ...DRAFT,
        content: {
          format: "gavel-draft",
          version: 2,
          document: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Published story" }],
              },
              {
                type: "image",
                attrs: { assetId, alt: "Photo", caption: null },
              },
            ],
          },
        },
      }).replace("public.save_article_draft", "public.save_published_article");
      await beginAsActor(a);
      expect(
        (await a.json<DraftWriteResult>(winner === "save" ? save : mark)).ok,
      ).toBe(true);
      await beginAsActor(b);
      const pending = b.json(winner === "save" ? mark : save);
      await waitForLock(observer, b);
      await a.execute("commit;");
      expect(await pending).toEqual({
        ok: false,
        code: winner === "save" ? "conflict" : "invalid_input",
      });
      await b.execute("commit;");
      expect(
        await observer.json<number>(
          `(select count(*) from public.article_body_images where asset_id='${assetId}')`,
        ),
      ).toBe(winner === "save" ? 1 : 0);
      expect(
        await observer.json<string>(
          `(select to_jsonb(status) from public.media_assets where id='${assetId}')`,
        ),
      ).toBe(winner === "save" ? "finalized" : "deleting");
    });
  },
);
