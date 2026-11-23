import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { waitForLock } from "../database-session/database-session";
import {
  ACTOR,
  createCommand,
  beginAsActor,
  withDraftFixtures,
} from "../draft-fixtures/draft-fixtures";

it("uses the last daily slot once when two fresh tag requests overlap", async () => {
  await withDraftFixtures(async ({ observer, a, b }) => {
    const firstName = `Tag race ${randomUUID()}`;
    const otherName = `Tag race ${randomUUID()}`;
    await observer.execute(`insert into private.member_tag_creation_limits(actor_user_id,quota_day,created_count)
      values('${ACTOR}',private.tag_creation_day(clock_timestamp()),29);`);
    try {
      await beginAsActor(a);
      const created = await a.json(`public.ensure_tag('${firstName}')`);
      expect(created).toMatchObject({ ok: true, created: true });
      await beginAsActor(b);
      const competing = b.json(`public.ensure_tag('${otherName}')`);
      await waitForLock(observer, b);
      await a.execute("commit;");
      expect(await competing).toEqual({ ok: false, code: "conflict" });
      expect(await b.json(`public.ensure_tag('${firstName}')`)).toMatchObject({
        ok: true,
        created: false,
      });
      await b.execute("commit;");
      expect(
        await observer.json(
          `(select created_count from private.member_tag_creation_limits where actor_user_id='${ACTOR}')`,
        ),
      ).toBe(30);
      expect(
        await observer.json(
          `(select count(*) from public.tags where name in('${firstName}','${otherName}'))`,
        ),
      ).toBe(1);
    } finally {
      await Promise.all([a.close(), b.close()]);
      await observer.execute(
        `delete from public.tags where name in ('${firstName}','${otherName}');`,
      );
    }
  });
});

it("resolves a published article lock conflict before a tag merge changes anything", async () => {
  await withDraftFixtures(async ({ observer, a, b }) => {
    const source = randomUUID();
    const target = randomUUID();
    const requestId = randomUUID();
    const merge = `public.merge_tags('${source}','${target}','${requestId}')`;
    await observer.execute(`update public.memberships set role='administrator' where user_id='${ACTOR}';
      insert into public.tags(id,name,slug)
      values('${source}','Merge source ${source}','merge-source-${source}'),
        ('${target}','Merge target ${target}','merge-target-${target}');`);
    try {
      await beginAsActor(a);
      const draft = await a.json<{ articleId: string }>(
        createCommand(randomUUID()),
      );
      await a.execute("commit;");
      await observer.execute(`update public.articles set status='published',published_at=now() where id='${draft.articleId}';
        insert into public.article_tags(article_id,tag_id) values('${draft.articleId}','${source}');`);
      await a.execute(
        `begin;select id from public.articles where id='${draft.articleId}' for update;`,
      );
      await beginAsActor(b);
      expect(await b.json(merge)).toEqual({ ok: false, code: "conflict" });
      await b.execute("commit;");
      expect(
        await observer.json(
          `(select edit_version from public.articles where id='${draft.articleId}')`,
        ),
      ).toBe(1);
      await a.execute("commit;");
      await beginAsActor(b);
      expect(await b.json(merge)).toMatchObject({
        ok: true,
        replayed: false,
        moved: 1,
      });
      expect(await b.json(merge)).toMatchObject({ ok: true, replayed: true });
      await b.execute("commit;");
    } finally {
      await Promise.all([a.close(), b.close()]);
      await observer.execute(`delete from public.article_tags where tag_id in ('${source}','${target}');
        delete from private.slug_redirects where source_path='/tags/merge-source-${source}';
        delete from public.tags where id in ('${source}','${target}');`);
    }
  });
});
