// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import {
  assertMatchingDbPort,
  dbContainer,
} from "../../e2e/support/db-container/db-container";

afterEach(() => vi.unstubAllEnvs());

it("defaults to the local test project's database", () => {
  vi.stubEnv("GAVEL_DB_CONTAINER", undefined);
  expect(dbContainer()).toBe("supabase_db_the-gavel");
});

it("accepts an explicit local Supabase database container", () => {
  vi.stubEnv("GAVEL_DB_CONTAINER", "supabase_db_gavel-isolated");
  expect(dbContainer()).toBe("supabase_db_gavel-isolated");
});

it("keeps a dedicated scratch fixture on its designated database", () => {
  vi.stubEnv("GAVEL_DB_CONTAINER", "supabase_db_the-gavel");
  expect(dbContainer("supabase_db_gavel-task19-browser")).toBe(
    "supabase_db_gavel-task19-browser",
  );
});

it.each(["", "--privileged", "other-db", "remote.example/pg"])(
  "rejects an invalid local override (%s)",
  (value) => {
    vi.stubEnv("GAVEL_DB_CONTAINER", value);
    expect(() => dbContainer()).toThrow(/local Supabase database container/);
  },
);

it("compares the selected container's published port with the CLI database URL", () => {
  const url = "postgresql://127.0.0.1:58722/postgres";
  expect(() =>
    assertMatchingDbPort(url, "0.0.0.0:58722\n[::]:58722\n"),
  ).not.toThrow();
  expect(() => assertMatchingDbPort(url, "0.0.0.0:54322\n")).toThrow(
    /does not match/,
  );
  expect(() =>
    assertMatchingDbPort(
      "postgresql://db.example:58722/postgres",
      "[::]:58722",
    ),
  ).toThrow(/does not match/);
});
