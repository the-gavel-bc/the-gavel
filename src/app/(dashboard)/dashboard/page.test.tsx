import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import DashboardLayout from "./layout";
import DashboardPage from "./page";
const access = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/access", () => ({ requireActiveMembership: access }));
vi.mock("@/lib/auth/actions", () => ({ signOut: vi.fn() }));
beforeEach(() => {
  access.mockReset();
});
it("renders the approved author dashboard without admin navigation", async () => {
  access.mockResolvedValue({
    status: "active",
    userId: "a",
    profileId: "p",
    displayName: "Author A",
    role: "author",
  });
  render(await DashboardLayout({ children: await DashboardPage() }));
  expect(screen.getByRole("heading", { name: "My articles" })).toBeVisible();
  expect(
    screen.queryByRole("link", { name: "Administration" }),
  ).not.toBeInTheDocument();
});
it.each(["/sign-in", "/access-pending"])(
  "guards layout and page independently: %s",
  async (destination) => {
    access.mockRejectedValue(new Error(`redirect:${destination}`));
    await expect(
      DashboardLayout({ children: <p>Private content</p> }),
    ).rejects.toThrow(`redirect:${destination}`);
    await expect(DashboardPage()).rejects.toThrow(`redirect:${destination}`);
  },
);
