import { expect, it } from "vitest";
import { tagNameSchema } from "./ensure-tag";
it("normalizes names and rejects empty or oversized names", () => {
  expect(tagNameSchema.parse("  Campus\t news \n")).toBe("Campus news");
  expect(tagNameSchema.safeParse(" ").success).toBe(false);
  expect(tagNameSchema.safeParse("a".repeat(121)).success).toBe(false);
});
