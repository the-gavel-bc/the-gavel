import { expect, it } from "vitest";
import { DatabaseSession } from "../database-session/database-session";
import { ADMIN, withSaveFixtures } from "./save-fixtures";
it("cleans save owner/admin fixtures without mutating seeded administrators", async () => {
  await withSaveFixtures(async ({ observer, articleId }) => {
    expect(
      await observer.json<number>(
        `(select edit_version from public.articles where id='${articleId}')`,
      ),
    ).toBe(1);
    expect(
      await observer.json<boolean>(
        `exists(select 1 from public.memberships where user_id='${ADMIN}' and role='administrator' and active)`,
      ),
    ).toBe(true);
  });
  const observer = new DatabaseSession();
  try {
    await observer.ready();
    expect(
      await observer.json<boolean>(
        `exists(select 1 from auth.users where id='${ADMIN}')`,
      ),
    ).toBe(false);
  } finally {
    await observer.close();
  }
});
