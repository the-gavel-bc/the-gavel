import { expect, it } from "vitest";
import {
  STAFF_ROLE_OPTIONS,
  staffRoleLabels,
  staffRoleSchema,
} from "./staff-roles";

it("keeps staff role parsers and labels aligned with the database enum", () => {
  expect(STAFF_ROLE_OPTIONS).toEqual(["author", "editor", "administrator"]);
  for (const role of STAFF_ROLE_OPTIONS) {
    expect(staffRoleSchema.parse(role)).toBe(role);
    expect(staffRoleLabels[role]).toBeTruthy();
  }
  expect(staffRoleSchema.safeParse("owner").success).toBe(false);
});
