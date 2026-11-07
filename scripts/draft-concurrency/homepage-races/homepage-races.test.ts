import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { ACTOR } from "../draft-fixtures/draft-fixtures";
import { fixtureJson, waitForLock } from "../database-session/database-session";
import {
  ADMIN,
  beginAsAdmin,
  withSaveFixtures,
} from "../save-fixtures/save-fixtures";

const content = {
  format: "gavel-draft",
  version: 1,
  document: {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Ready story" }] },
    ],
  },
};
for (const archiveFirst of [false, true]) {
  it(`selection and archive serialize safely (archive first: ${archiveFirst})`, async () => {
    await withSaveFixtures(async ({ observer, a, b, articleId }) => {
      const asset = randomUUID();
      let prepared = false;
      try {
        if (
          await observer.json<boolean>(`exists(select 1 from public.homepage_selections) or
          exists(select 1 from public.homepage_curation where edit_version<>1)`)
        )
          throw new Error(
            "Homepage fixture requires an empty local curation; refusing to overwrite data.",
          );
        await observer.execute(`begin;
          update public.articles set content=${fixtureJson(content)} where id='${articleId}';
          insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status,byte_size,width,height,sha256,finalized_at)
            values('${asset}','${articleId}','${ACTOR}','${randomUUID()}','homepage-race/${asset}.webp','finalized',1234,120,90,repeat('d',64),now());
          insert into public.article_main_images(article_id,asset_id,alt_text,credit)
            values('${articleId}','${asset}','Race image','The Gavel');commit;`);
        prepared = true;
        await beginAsAdmin(a);
        expect(
          await a.json<{ ok: boolean }>(
            `public.publish_article('${articleId}'::uuid,1,'${randomUUID()}'::uuid)`,
          ),
        ).toMatchObject({ ok: true });
        await a.execute("commit;");
        const selection = `public.save_homepage_selections(1,'${randomUUID()}'::uuid,'${articleId}'::uuid,'{}'::uuid[],'{}'::uuid[])`;
        const archive = `public.archive_article('${articleId}'::uuid,2,'${randomUUID()}'::uuid)`;
        await beginAsAdmin(a);
        expect(
          await a.json<{ ok: boolean }>(archiveFirst ? archive : selection),
        ).toMatchObject({ ok: true });
        await beginAsAdmin(b);
        const competing = b.json<{ ok: boolean; code?: string }>(
          archiveFirst ? selection : archive,
        );
        await waitForLock(observer, b);
        await a.execute("commit;");
        expect(await competing).toMatchObject(
          archiveFirst ? { ok: false, code: "invalid_input" } : { ok: true },
        );
        await b.execute("commit;");
        if (!archiveFirst) {
          await beginAsAdmin(a);
          const view = await a.json<{
            saved: { lead: { status: string } };
            effective: { lead: { id: string } | null };
          }>("public.get_admin_homepage_curation()");
          expect(view.saved.lead.status).toBe("archived");
          expect(view.effective.lead?.id).not.toBe(articleId);
          await a.execute("commit;");
        }
      } finally {
        await Promise.all([a.close(), b.close()]);
        if (prepared)
          await observer.execute(`begin;
          delete from private.homepage_write_receipts where actor_user_id='${ADMIN}';
          delete from public.homepage_selections;
          update public.homepage_curation set edit_version=1;commit;`);
      }
    });
  });
}
