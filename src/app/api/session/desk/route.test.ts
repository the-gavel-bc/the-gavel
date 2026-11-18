import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ access: vi.fn(), cookies: vi.fn() }));
vi.mock("@/backend/auth/access/access", () => ({
  getCurrentAccess: mocks.access,
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
import { GET } from "./route";

const withCookies = (...names: string[]) =>
  mocks.cookies.mockResolvedValue({
    getAll: () => names.map((name) => ({ name, value: "x" })),
  });
beforeEach(() => vi.resetAllMocks());

it("answers readers without an auth cookie without touching auth", async () => {
  withCookies("theme");
  const response = await GET();
  expect(await response.json()).toEqual({ desk: null });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.access).not.toHaveBeenCalled();
});

it("hides the desk from signed-in people without active membership", async () => {
  withCookies("sb-127-auth-token");
  mocks.access.mockResolvedValue({ status: "pending" });
  expect(await (await GET()).json()).toEqual({ desk: null });
  mocks.access.mockRejectedValue(new Error("Unable to verify"));
  expect(await (await GET()).json()).toEqual({ desk: null });
});

it("returns only the active member's name and role", async () => {
  withCookies("sb-127-auth-token.0");
  mocks.access.mockResolvedValue({
    status: "active",
    userId: "u",
    profileId: "p",
    displayName: "Avery Quinn",
    role: "author",
  });
  expect(await (await GET()).json()).toEqual({
    desk: { displayName: "Avery Quinn", role: "author" },
  });
});
