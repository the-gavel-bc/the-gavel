import { expect, it } from "vitest";
import { backTarget } from "./back-link";

it("shows no back link on top-level pages", () => {
  expect(backTarget("/dashboard", null)).toBeNull();
  expect(backTarget("/dashboard/admin/taxonomy", "/dashboard")).toBeNull();
});

it("falls back to the parent list after a full page load", () => {
  expect(backTarget("/dashboard/articles/abc", null)).toEqual({
    href: "/dashboard",
    label: "My articles",
  });
  expect(backTarget("/dashboard/admin/members/audit", null)).toMatchObject({
    href: "/dashboard/admin/members",
    label: "Memberships",
  });
});

it("returns to the previous page with its filters", () => {
  expect(
    backTarget(
      "/dashboard/articles/abc",
      "/dashboard/admin/articles?status=published&search=bc",
    ),
  ).toEqual({
    href: "/dashboard/admin/articles?status=published&search=bc",
    label: "Administration",
  });
  expect(
    backTarget("/dashboard/articles/abc", "/dashboard/admin/articles/abc"),
  ).toMatchObject({ label: "Article details" });
});

it("never returns to the empty new-draft form after creating", () => {
  expect(
    backTarget("/dashboard/articles/abc", "/dashboard/articles/new"),
  ).toMatchObject({ href: "/dashboard" });
});
