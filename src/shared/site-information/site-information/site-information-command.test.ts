import { describe, expect, it } from "vitest";
import {
  isValidContactEmail,
  siteInformationCommandSchema,
} from "./site-information-command";

const valid = {
  requestId: "00000000-0000-4000-8000-000000000001",
  expectedVersion: 1,
  mission: "Independent journalism.\n\nFor our community.",
  contactEmail: "news@example.edu",
  instagramUrl: "https://www.instagram.com/thegavel/",
  spotifyUrl: null,
  linkedinUrl: null,
  facebookUrl: null,
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
        spotifyUrl: null,
        linkedinUrl: null,
        facebookUrl: null,
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
      { ...valid, submissionInstructions: "no longer editable" },
    ])
      expect(siteInformationCommandSchema.safeParse(value).success).toBe(false);
  });
  it.each([
    "first..last@bc.edu",
    ".desk@bc.edu",
    "desk.@bc.edu",
    "desk@-bc.edu",
    "desk@bc-.edu",
    `${"a".repeat(65)}@bc.edu`,
    `desk@${"a".repeat(64)}.edu`,
  ])("rejects %s, which the public reader would hide", (contactEmail) => {
    expect(isValidContactEmail(contactEmail)).toBe(false);
    expect(
      siteInformationCommandSchema.safeParse({ ...valid, contactEmail })
        .success,
    ).toBe(false);
  });
  it("accepts addresses the public reader shows", () => {
    for (const address of [
      "desk?letters@bc.edu",
      "a.b@news.bc.edu",
      `${"a".repeat(64)}@bc.edu`,
    ])
      expect(isValidContactEmail(address)).toBe(true);
  });
  it.each([
    ["spotifyUrl", "https://open.spotify.com/show/2abc"],
    ["linkedinUrl", "https://www.linkedin.com/company/the-gavel/"],
    ["linkedinUrl", "https://linkedin.com/in/editor"],
    ["facebookUrl", "https://www.facebook.com/bcgavel"],
  ])("accepts an official %s", (field, url) => {
    expect(
      siteInformationCommandSchema.safeParse({ ...valid, [field]: url })
        .success,
    ).toBe(true);
  });
  it.each([
    ["spotifyUrl", "http://open.spotify.com/show/2abc"],
    ["spotifyUrl", "https://spotify.com.evil.test/show"],
    ["linkedinUrl", "https://www.linkedin.com/feed/"],
    ["linkedinUrl", "javascript:alert(1)"],
    ["facebookUrl", "https://facebook.com.evil.test/gavel"],
    ["facebookUrl", "https://www.facebook.com/gavel?x=1"],
  ])("rejects %s %s", (field, url) => {
    expect(
      siteInformationCommandSchema.safeParse({ ...valid, [field]: url })
        .success,
    ).toBe(false);
  });
});
