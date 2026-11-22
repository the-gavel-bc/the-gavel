import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import MediaCleanupPage from "./page";

const mocks = vi.hoisted(() => ({ status: vi.fn(), access: vi.fn() }));
vi.mock("@/backend/auth/access/access", () => ({
  requireActiveMembership: mocks.access,
}));
vi.mock(
  "@/backend/media/retired-media-cleanup/cleanup-status",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/backend/media/retired-media-cleanup/cleanup-status")
    >()),
    getMediaCleanupStatus: mocks.status,
  }),
);
vi.mock(
  "@/frontend/features/media/components/media-cleanup/media-cleanup-control",
  () => ({
    MediaCleanupControl: () => null,
  }),
);

it.each([
  [null, "Needs attention"],
  [72, "Needs attention"],
  [1, "Healthy"],
])(
  "labels the cleanup status with a check %s hours old",
  async (age, label) => {
    mocks.access.mockResolvedValue({ role: "administrator" });
    mocks.status.mockResolvedValue({
      failedKeys: 0,
      failedPrefixes: 0,
      lastHealthyAt:
        age === null
          ? null
          : new Date(Date.now() - age * 60 * 60 * 1000).toISOString(),
    });
    render(await MediaCleanupPage());
    expect(screen.getByText(label, { exact: true })).toBeVisible();
  },
);

it.each(["author", "editor"])(
  "refuses %s before loading cleanup status",
  async (role) => {
    mocks.access.mockResolvedValue({ role });
    mocks.status.mockClear();
    render(await MediaCleanupPage());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Administrator access required.",
    );
    expect(mocks.status).not.toHaveBeenCalled();
  },
);

it("keeps a cleanup service failure out of the page output", async () => {
  mocks.access.mockResolvedValue({ role: "administrator" });
  mocks.status.mockRejectedValueOnce(new Error("private cleanup diagnostic"));
  render(await MediaCleanupPage());
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Unable to load cleanup status.",
  );
  expect(
    screen.queryByText("private cleanup diagnostic"),
  ).not.toBeInTheDocument();
});
