import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { waitForLock } from "../database-session/database-session";
import {
  ADMIN,
  beginAsAdmin,
  withSaveFixtures,
} from "../save-fixtures/save-fixtures";

it("concurrent administrator saves serialize and reject the stale version", async () => {
  await withSaveFixtures(async ({ observer, a, b }) => {
    const empty =
      await observer.json<boolean>(`exists(select 1 from public.site_information where edit_version=1
      and mission is null and contact_email is null and instagram_url is null and submission_instructions is null)`);
    if (!empty)
      throw new Error(
        "Site information is not empty; refusing to overwrite local data.",
      );
    try {
      await beginAsAdmin(a);
      expect(
        await a.json(
          `public.save_site_information(1,'${randomUUID()}'::uuid,'Synthetic site race',null,null,null)`,
        ),
      ).toMatchObject({ ok: true, version: 2 });
      await beginAsAdmin(b);
      const stale = b.json(
        `public.save_site_information(1,'${randomUUID()}'::uuid,'Stale site race',null,null,null)`,
      );
      await waitForLock(observer, b);
      await a.execute("commit;");
      expect(await stale).toEqual({ ok: false, code: "conflict" });
      await b.execute("commit;");
    } finally {
      await Promise.all([a.close(), b.close()]);
      await observer.execute(`do $$ begin
        if exists(select 1 from private.site_information_receipts where actor_user_id='${ADMIN}') then
          if not exists(select 1 from public.site_information where edit_version=2 and mission='Synthetic site race' and contact_email is null and instagram_url is null and submission_instructions is null)
          then raise exception 'Site settings changed outside race fixture; refusing cleanup'; end if;
          update public.site_information set mission=null,edit_version=1 where id='00000000-0000-0000-0000-000000000002';
          delete from private.site_information_receipts where actor_user_id='${ADMIN}';
        end if;
      end $$;`);
    }
  });
});
