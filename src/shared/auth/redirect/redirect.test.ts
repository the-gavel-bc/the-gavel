import { expect, it } from "vitest";
import { safeDashboardPath } from "./redirect";

it.each([
  "https://attacker.test",
  "//attacker.test",
  "/\\attacker.test",
  "/dashboard/../sign-in",
  "/dashboardish",
  "/auth/callback",
  "%2f%2fattacker.test",
])("rejects unsafe redirect %s", (value) => {
  expect(safeDashboardPath(value)).toBe("/dashboard");
});
it("allows a local dashboard destination", () => {
  expect(safeDashboardPath("/dashboard/profile?tab=bio")).toBe(
    "/dashboard/profile?tab=bio",
  );
});
