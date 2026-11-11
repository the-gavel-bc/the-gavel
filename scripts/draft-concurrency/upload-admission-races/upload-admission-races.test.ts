import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { ACTOR, beginAsActor } from "../draft-fixtures/draft-fixtures";
import { withSaveFixtures } from "../save-fixtures/save-fixtures";
import { waitForLock } from "../database-session/database-session";

it("serializes the last upload admission across independent sessions", async () => {
  await withSaveFixtures(async ({ observer, a, b, articleId }) => {
    const assetId = randomUUID();
    await observer.execute(`insert into public.media_assets(id,article_id,uploader_user_id,request_id,object_key,status)
      values('${assetId}','${articleId}','${ACTOR}','${randomUUID()}','${articleId}/${assetId}.webp','pending');
      insert into private.upload_processing_limits(actor_user_id,attempt_count) values('${ACTOR}',29);`);
    const admission = `public.admit_article_image_upload('${articleId}','${assetId}')`;
    await beginAsActor(a);
    expect(await a.json(admission)).toEqual({ ok: true, replayed: false });
    await beginAsActor(b);
    const pending = b.json<{ ok: boolean; code: string; retryAfter: number }>(
      admission,
    );
    await waitForLock(observer, b);
    await a.execute("commit;");
    expect(await pending).toEqual({
      ok: false,
      code: "rate_limited",
      retryAfter: expect.any(Number),
    });
    await b.execute("commit;");
    expect(
      await observer.json<number>(
        `(select attempt_count from private.upload_processing_limits where actor_user_id='${ACTOR}')`,
      ),
    ).toBe(30);
  });
});
