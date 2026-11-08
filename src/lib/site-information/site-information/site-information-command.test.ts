import { describe, expect, it } from "vitest";
import { siteInformationCommandSchema } from "./site-information-command";

const valid = {
  requestId: "00000000-0000-4000-8000-000000000001",
  expectedVersion: 1,
  mission: "Independent journalism.\n\nFor our community.",
  contactEmail: "news@example.edu",
  instagramUrl: "https://www.instagram.com/thegavel/",
  submissionInstructions: "Send a letter.\nInclude your name.",
};

describe("site information command", () => {
  it("accepts bounded plain text, approved links, and unset values", () => {
    expect(siteInformationCommandSchema.safeParse(valid).success).toBe(true);
    expect(
      siteInformationCommandSchema.safeParse({
        ...valid,
        mission: null,
        contactEmail: null,
        instagramUrl: null,
        submissionInstructions: null,
      }).success,
    ).toBe(true);
  });
  it("rejects extra fields, markup, malformed email, and unsafe URLs", () => {
    for (const value of [
      { ...valid, unknown: "x" },
      { ...valid, mission: "<script>bad</script>" },
      { ...valid, contactEmail: "invalid@" },
      { ...valid, instagramUrl: "javascript:alert(1)" },
      { ...valid, instagramUrl: "https://instagram.com.evil.test/path" },
      { ...valid, submissionInstructions: "x".repeat(5001) },
    ])
      expect(siteInformationCommandSchema.safeParse(value).success).toBe(false);
  });
});
