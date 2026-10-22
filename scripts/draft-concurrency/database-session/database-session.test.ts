import { expect, it } from "vitest";
import { DatabaseSession } from "./database-session";
it("uses independent rollback-capable PostgreSQL sessions", async () => {
  const a = new DatabaseSession(),
    b = new DatabaseSession();
  try {
    await Promise.all([a.ready(), b.ready()]);
    const ids = await Promise.all([
      a.json<number>("pg_backend_pid()"),
      b.json<number>("pg_backend_pid()"),
    ]);
    expect(ids[0]).not.toBe(ids[1]);
    await a.execute(
      "begin;create temporary table session_fixture(value integer);insert into session_fixture values(1);rollback;",
    );
    expect(
      await a.json<boolean>("to_regclass('pg_temp.session_fixture') is null"),
    ).toBe(true);
  } finally {
    await Promise.all([a.close(), b.close()]);
  }
});
