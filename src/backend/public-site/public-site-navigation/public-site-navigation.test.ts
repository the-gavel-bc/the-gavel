import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock(
  "@/backend/infrastructure/supabase/public-reader/public-reader",
  () => ({
    createPublicReaderClient: () => ({ rpc: mocks.rpc }),
  }),
);
import { getPublicSiteNavigation } from "./public-site-navigation";

const result = {
  kind: "ok",
  sections: [
    {
      name: "News",
      slug: "news",
      categories: [{ name: "Campus", slug: "campus" }],
    },
  ],
  information: {
    mission: "😀".repeat(5000),
    contactEmail: "editor@bc.edu",
    instagramUrl: "https://www.instagram.com/thegavel/",
    submissionInstructions: "Send a letter",
  },
};

describe("getPublicSiteNavigation", () => {
  beforeEach(() => vi.resetAllMocks());
  it("returns public data and preserves Unicode text limits", async () => {
    mocks.rpc.mockResolvedValue({ data: result, error: null });
    expect(await getPublicSiteNavigation()).toEqual(result);
    expect(mocks.rpc).toHaveBeenCalledWith("get_public_site_navigation");
  });
  it("accepts empty catalogs and unset settings", async () => {
    const empty = {
      kind: "ok",
      sections: [],
      information: {
        mission: null,
        contactEmail: null,
        instagramUrl: null,
        submissionInstructions: null,
      },
    };
    mocks.rpc.mockResolvedValue({ data: empty, error: null });
    expect(await getPublicSiteNavigation()).toEqual(empty);
  });
  it("rejects unsafe URLs, email and unexpected private fields", async () => {
    for (const information of [
      {
        ...result.information,
        instagramUrl: "https://instagram.com.evil.test/user",
      },
      { ...result.information, instagramUrl: "https://instagram.com/user\n" },
      { ...result.information, contactEmail: "editor@bc.edu\n" },
      { ...result.information, contactEmail: "a..b@example.com" },
      { ...result.information, contactEmail: "a@domain-.com" },
      { ...result.information, editVersion: 1 },
    ]) {
      mocks.rpc.mockResolvedValueOnce({
        data: { ...result, information },
        error: null,
      });
      expect(await getPublicSiteNavigation()).toEqual({ kind: "unavailable" });
    }
  });
  it("rejects excessive totals and catches database failures", async () => {
    const categories = Array.from({ length: 1001 }, (_, i) => ({
      name: "Category",
      slug: `category-${i}`,
    }));
    mocks.rpc
      .mockResolvedValueOnce({
        data: {
          ...result,
          sections: [{ name: "News", slug: "news", categories }],
        },
        error: null,
      })
      .mockRejectedValueOnce(new Error("private detail"));
    expect(await getPublicSiteNavigation()).toEqual({ kind: "unavailable" });
    expect(await getPublicSiteNavigation()).toEqual({ kind: "unavailable" });
  });
});
