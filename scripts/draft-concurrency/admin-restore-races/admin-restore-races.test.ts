import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import type {
  DraftDocument,
  DraftWriteResult,
} from "../../../src/shared/articles/draft-contract/draft-contract";
import { ACTOR, DRAFT, beginAsActor } from "../draft-fixtures/draft-fixtures";
import { fixtureJson, waitForLock } from "../database-session/database-session";
import { beginAsAdmin, withSaveFixtures } from "../save-fixtures/save-fixtures";

const content: DraftDocument = {
  format: "gavel-draft",
  version: 1,
  document: {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Ready archive" }] },
    ],
  },
};
function transition(
  operation: "publish" | "archive" | "restore",
  id: string,
  version: number,
) {
  return `public.${operation}_article('${id}'::uuid,${version},'${randomUUID()}'::uuid)`;
}
it("admin restore and owner published save serialize on the article", async () => {
  await withSaveFixtures(async ({ observer, a, b, articleId }) => {
    const assetId = randomUUID();
    await observer.execute(`begin;
      update public.articles set content=${fixtureJson(content)} where id='${articleId}';
      insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,byte_size,width,height,sha256,finalized_at)
      values('${assetId}','${articleId}','${ACTOR}','${randomUUID()}','restore-race/${assetId}.webp','finalized',1234,120,90,repeat('d',64),now());
      insert into public.article_main_images(article_id,asset_id,alt_text,credit) values('${articleId}','${assetId}','Race image','The Gavel');
      commit;`);
    await beginAsAdmin(a);
    expect(
      (await a.json<{ ok: boolean }>(transition("publish", articleId, 1))).ok,
    ).toBe(true);
    await a.execute("commit;");
    await beginAsActor(b);
    expect(
      (await b.json<{ ok: boolean }>(transition("archive", articleId, 2))).ok,
    ).toBe(true);
    await b.execute("commit;");
    await beginAsAdmin(a);
    expect(
      await a.json<{ ok: boolean; version: number }>(
        transition("restore", articleId, 3),
      ),
    ).toMatchObject({ ok: true, version: 4 });
    await beginAsActor(b);
    const stale = b.json<DraftWriteResult>(
      `public.save_published_article('${articleId}'::uuid,3,'${randomUUID()}'::uuid,${fixtureJson({ ...DRAFT, content, title: "Stale edit" })})`,
    );
    await waitForLock(observer, b);
    await a.execute("commit;");
    expect(await stale).toEqual({ ok: false, code: "conflict" });
    await b.execute("commit;");
    expect(
      await observer.json(
        `(select jsonb_build_object('status',status,'version',edit_version) from public.articles where id='${articleId}')`,
      ),
    ).toEqual({ status: "published", version: 4 });
    expect(
      await observer.json<number>(
        `(select count(*) from public.article_revisions where article_id='${articleId}')`,
      ),
    ).toBe(4);
  });
});
