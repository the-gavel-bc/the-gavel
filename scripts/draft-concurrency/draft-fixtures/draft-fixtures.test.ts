import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import type { DraftWriteResult } from "../../../src/lib/articles/draft-contract/draft-contract";
import {
  ACTOR,
  beginAsActor,
  createCommand,
  withDraftFixtures,
} from "./draft-fixtures";
import { DatabaseSession } from "../database-session/database-session";
it("creates isolated synthetic rows and removes all committed fixture data", async () => {
  await withDraftFixtures(async ({ a }) => {
    await beginAsActor(a);
    const result = await a.json<DraftWriteResult>(createCommand(randomUUID()));
    expect(result.ok).toBe(true);
    await a.execute("commit;");
  });
  const observer = new DatabaseSession();
  try {
    await observer.ready();
    expect(
      await observer.json<boolean>(
        `exists(select 1 from auth.users where id='${ACTOR}')`,
      ),
    ).toBe(false);
  } finally {
    await observer.close();
  }
});
