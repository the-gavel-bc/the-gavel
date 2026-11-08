import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/auth/access/access", () => ({ getCurrentAccess: mocks.access }));
vi.mock("@/lib/supabase/server/server", () => ({
  createServerSupabaseClient: async () => ({ rpc: mocks.rpc }),
}));
import { saveSiteInformationAction } from "./site-information-actions";
const command = {
  requestId: "00000000-0000-4000-8000-000000000001",
  expectedVersion: 1,
  mission: "Mission",
  contactEmail: null,
  instagramUrl: null,
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
  it("reports uncertain database failures without leaking details", async () => {
    mocks.access.mockResolvedValue({ status: "active", role: "administrator" });
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "private" } });
    expect(await saveSiteInformationAction(command)).toEqual({
      ok: false,
      code: "unavailable",
    });
  });
});
