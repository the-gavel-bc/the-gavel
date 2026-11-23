import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidate,
  updateTag: vi.fn(),
  unstable_cache: vi.fn(),
}));
vi.mock("@/backend/auth/access/access", () => ({
  getCurrentAccess: mocks.access,
}));
vi.mock("@/backend/infrastructure/supabase/server/server", () => ({
  createServerSupabaseClient: async () => ({ rpc: mocks.rpc }),
}));
import { saveSiteInformationAction } from "./site-information-actions";
const command = {
  requestId: "00000000-0000-4000-8000-000000000001",
  expectedVersion: 1,
  mission: "Mission",
  contactEmail: null,
  instagramUrl: null,
  spotifyUrl: null,
  linkedinUrl: null,
  facebookUrl: null,
  submissionInstructions: null,
};
describe("site information save", () => {
  beforeEach(() => vi.clearAllMocks());
  it("denies an author without calling the database", async () => {
    mocks.access.mockResolvedValue({ status: "active", role: "author" });
    expect(await saveSiteInformationAction(command)).toEqual({
      ok: false,
      code: "forbidden",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("saves as administrator and returns safe validated results", async () => {
    mocks.access.mockResolvedValue({ status: "active", role: "administrator" });
    mocks.rpc.mockResolvedValue({
      data: { ok: true, version: 2, changed: true, replayed: false },
      error: null,
    });
    expect(await saveSiteInformationAction(command)).toEqual({
      ok: true,
      version: 2,
      changed: true,
      replayed: false,
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard/admin/site");
  });
  it("forwards the social links to the save RPC", async () => {
    mocks.access.mockResolvedValue({ status: "active", role: "administrator" });
    mocks.rpc.mockResolvedValue({
      data: { ok: true, version: 2, changed: true, replayed: false },
      error: null,
    });
    await saveSiteInformationAction({
      ...command,
      spotifyUrl: "https://open.spotify.com/show/2abc",
      linkedinUrl: "https://www.linkedin.com/company/the-gavel/",
      facebookUrl: "https://www.facebook.com/bcgavel",
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "save_site_information",
      expect.objectContaining({
        p_spotify_url: "https://open.spotify.com/show/2abc",
        p_linkedin_url: "https://www.linkedin.com/company/the-gavel/",
        p_facebook_url: "https://www.facebook.com/bcgavel",
      }),
    );
  });
  it("reports uncertain database failures without leaking details", async () => {
    mocks.access.mockResolvedValue({ status: "active", role: "administrator" });
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "private" } });
    expect(await saveSiteInformationAction(command)).toEqual({
      ok: false,
      code: "unavailable",
    });
  });
});
