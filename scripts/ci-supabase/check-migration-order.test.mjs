// @vitest-environment node
import { expect, it } from "vitest";
import { checkMigrationOrder } from "./check-migration-order.mjs";

const base = [
  "20261121010000_publication_date.sql",
  "20261121020000_lifecycle.sql",
];

it("accepts an unchanged list and strictly newer migrations", () => {
  expect(() => checkMigrationOrder(base, base)).not.toThrow();
  expect(() =>
    checkMigrationOrder(base, [
      ...base,
      "20261121030000_database_privileges.sql",
    ]),
  ).not.toThrow();
});

it("rejects a new migration older than the latest base migration", () => {
  expect(() =>
    checkMigrationOrder(base, [...base, "20261121015000_late_addition.sql"]),
  ).toThrow(/must be newer than 20261121020000/);
});

it("rejects reused versions even when filenames differ", () => {
  expect(() =>
    checkMigrationOrder(base, [...base, "20261121020000_collision.sql"]),
  ).toThrow(/Duplicate migration version 20261121020000/);
});

it("rejects removed or renamed base migrations", () => {
  expect(() => checkMigrationOrder(base, base.slice(1))).toThrow(
    /Missing base migration: 20261121010000_publication_date.sql/,
  );
  expect(() =>
    checkMigrationOrder(base, ["20261121010000_renamed.sql", base[1]]),
  ).toThrow(/Missing base migration: 20261121010000_publication_date.sql/);
});

it("rejects SQL migrations without a sortable version prefix", () => {
  expect(() => checkMigrationOrder(base, [...base, "unversioned.sql"])).toThrow(
    /Invalid migration filename: unversioned.sql/,
  );
});
