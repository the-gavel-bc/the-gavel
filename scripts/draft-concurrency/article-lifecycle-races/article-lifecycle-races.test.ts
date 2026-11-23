import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import type {
  DraftDocument,
  DraftWriteResult,
} from "../../../src/shared/articles/draft-contract/draft-contract";
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

it("serializes a publication-date edit before a competing publish", async () => {
  await withSaveFixtures(async ({ observer, a, b, articleId }) => {
    const assetId = randomUUID();
    await observer.execute(`begin;
      update public.articles set content=${fixtureJson(content)} where id='${articleId}';
      insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,byte_size,width,height,sha256,finalized_at)
      values('${assetId}','${articleId}','${ACTOR}','${randomUUID()}','lifecycle-date/${assetId}.webp','finalized',1234,120,90,repeat('b',64),now());
      insert into public.article_main_images(article_id,asset_id,alt_text,credit)
      values('${articleId}','${assetId}','Race image','The Gavel');
      commit;`);
    await beginAsActor(a);
    const dateEdit = await a.json<DraftWriteResult>(
      saveCommand(articleId, 1, randomUUID(), {
        ...DRAFT,
        content,
        publicationDate: "2026-03-08",
      }),
    );
    await beginAsActor(b);
    const publish = b.json<{ ok: boolean; code?: string }>(
      transition("publish", articleId, 1),
    );
    await waitForLock(observer, b);
    await a.execute("commit;");
    expect(dateEdit).toMatchObject({ ok: true, version: 2 });
    expect(await publish).toEqual({ ok: false, code: "conflict" });
    await b.execute("commit;");
    expect(
      await observer.json(
        `(select jsonb_build_object('status',status,'version',edit_version,'date',publication_date) from public.articles where id='${articleId}')`,
      ),
    ).toEqual({ status: "draft", version: 2, date: "2026-03-08" });
  });
});

it("serializes submission before a competing owner save", async () => {
  await withSaveFixtures(async ({ observer, a, b, articleId }) => {
    const assetId = randomUUID();
    await observer.execute(`begin;
      update public.articles set content=${fixtureJson(content)} where id='${articleId}';
      insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,byte_size,width,height,sha256,finalized_at)
      values('${assetId}','${articleId}','${ACTOR}','${randomUUID()}','lifecycle-submit/${assetId}.webp','finalized',1234,120,90,repeat('d',64),now());
      insert into public.article_main_images(article_id,asset_id,alt_text,credit)
      values('${articleId}','${assetId}','Race image','The Gavel');
      commit;`);
    await beginAsActor(a);
    expect(
      await a.json<{ ok: boolean }>(
        `public.submit_article('${articleId}'::uuid,1,'${randomUUID()}'::uuid)`,
      ),
    ).toMatchObject({ ok: true });
    await beginAsActor(b);
    const save = b.json<DraftWriteResult>(
      saveCommand(articleId, 1, randomUUID(), {
        ...DRAFT,
        title: "Concurrent save",
      }),
    );
    await waitForLock(observer, b);
    await a.execute("commit;");
    expect(await save).toEqual({ ok: false, code: "conflict" });
    await b.execute("commit;");
    expect(
      await observer.json(
        `(select jsonb_build_object('status',status,'version',edit_version,'requested',review_requested_at is not null) from public.articles where id='${articleId}')`,
      ),
    ).toEqual({ status: "draft", version: 2, requested: true });
  });
});

it("serializes a return before a competing save and preserves the return note", async () => {
  await withSaveFixtures(async ({ observer, a, b, articleId }) => {
    const assetId = randomUUID();
    await observer.execute(`begin;
      update public.articles set content=${fixtureJson(content)} where id='${articleId}';
      insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,byte_size,width,height,sha256,finalized_at)
      values('${assetId}','${articleId}','${ACTOR}','${randomUUID()}','lifecycle-return/${assetId}.webp','finalized',1234,120,90,repeat('e',64),now());
      insert into public.article_main_images(article_id,asset_id,alt_text,credit)
      values('${articleId}','${assetId}','Race image','The Gavel');
      commit;`);
    await beginAsActor(a);
    expect(
      await a.json<{ ok: boolean }>(
        `public.submit_article('${articleId}'::uuid,1,'${randomUUID()}'::uuid)`,
      ),
    ).toMatchObject({ ok: true });
    await a.execute("commit;");

    await beginAsActor(a);
    const returned = a.json<{ ok: boolean }>(
      `public.return_article('${articleId}'::uuid,2,'${randomUUID()}'::uuid,'Please revise the summary')`,
    );
    await beginAsActor(b);
    const save = b.json<DraftWriteResult>(
      saveCommand(articleId, 2, randomUUID(), {
        ...DRAFT,
        title: "Competing edit",
      }),
    );
    await waitForLock(observer, b);
    await a.execute("commit;");
    expect(await returned).toMatchObject({ ok: true, version: 3 });
    expect(await save).toEqual({ ok: false, code: "conflict" });
    await b.execute("commit;");
    expect(
      await observer.json(
        `(select jsonb_build_object('status',status,'version',edit_version,'requested',review_requested_at is not null,'note',review_note) from public.articles where id='${articleId}')`,
      ),
    ).toEqual({
      status: "draft",
      version: 3,
      requested: false,
      note: "Please revise the summary",
    });
  });
});
