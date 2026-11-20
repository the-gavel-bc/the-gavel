import { z } from "zod";
import type { Database } from "@/shared/database/database.types";

export type StaffRole = Database["public"]["Enums"]["app_role"];
export const STAFF_ROLE_OPTIONS = [
  "author",
  "editor",
  "administrator",
] as const satisfies readonly StaffRole[];
export const staffRoleSchema = z.enum(STAFF_ROLE_OPTIONS);
export const staffRoleLabels: Record<StaffRole, string> = {
  author: "Author",
  editor: "Editor",
  administrator: "Administrator",
};
