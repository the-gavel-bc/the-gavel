import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import type {
  DraftDocument,
  DraftWriteResult,
} from "../../../src/lib/articles/draft-contract/draft-contract";
import { ACTOR, DRAFT, beginAsActor } from "../draft-fixtures/draft-fixtures";
import { fixtureJson, waitForLock } from "../database-session/database-session";
import { saveCommand, withSaveFixtures } from "../save-fixtures/save-fixtures";

const content: DraftDocument = {
  format: "gavel-draft",
  version: 1,
  document: {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Ready article" }] },
    ],
  },
};
function transition(
  operation: "publish" | "archive",
  id: string,
  version: number,
) {
  return `public.${operation}_article('${id}'::uuid,${version},'${randomUUID()}'::uuid)`;
}
it("publish and archive serialize against saves and leave one transition history each", async () => {
  await withSaveFixtures(async ({ observer, a, b, articleId }) => {
    const assetId = randomUUID();
    await observer.execute(`begin;
      update public.articles set content=${fixtureJson(content)} where id='${articleId}';
      insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,byte_size,width,height,sha256,finalized_at)
      values('${assetId}','${articleId}','${ACTOR}','${randomUUID()}','lifecycle-race/${assetId}.webp','finalized',1234,120,90,repeat('a',64),now());
      insert into public.article_main_images(article_id,asset_id,alt_text,credit) values('${articleId}','${assetId}','Race image','The Gavel');
      commit;`);
    await beginAsActor(a);
    const published = await a.json<{ ok: boolean; version: number }>(
      transition("publish", articleId, 1),
    );
    expect(published).toMatchObject({ ok: true, version: 2 });
    await beginAsActor(b);
    const staleDraftSave = b.json<DraftWriteResult>(
      saveCommand(articleId, 1, randomUUID(), {
        ...DRAFT,
        content,
        title: "Stale",
      }),
    );
    await waitForLock(observer, b);
    await a.execute("commit;");
    expect(await staleDraftSave).toEqual({ ok: false, code: "conflict" });
    await b.execute("commit;");

    await beginAsActor(a);
    const archived = await a.json<{ ok: boolean; version: number }>(
      transition("archive", articleId, 2),
    );
    expect(archived).toMatchObject({ ok: true, version: 3 });
    await beginAsActor(b);
    const stalePublishedSave = b.json<DraftWriteResult>(
      `public.save_published_article('${articleId}'::uuid,2,'${randomUUID()}'::uuid,${fixtureJson({ ...DRAFT, content })})`,
    );
    await waitForLock(observer, b);
    await a.execute("commit;");
    expect(await stalePublishedSave).toEqual({ ok: false, code: "conflict" });
    await b.execute("commit;");
    expect(
      await observer.json(
        `(select jsonb_build_object('status',status,'version',edit_version) from public.articles where id='${articleId}')`,
      ),
    ).toEqual({ status: "archived", version: 3 });
    expect(
      await observer.json<number>(
        `(select count(*) from public.article_revisions where article_id='${articleId}')`,
      ),
    ).toBe(3);
  });
});
