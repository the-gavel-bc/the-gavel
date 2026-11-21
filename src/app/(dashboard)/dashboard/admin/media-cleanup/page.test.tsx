import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import MediaCleanupPage from "./page";

const mocks = vi.hoisted(() => ({ status: vi.fn() }));
vi.mock("@/backend/auth/access/access", () => ({
  requireActiveMembership: async () => ({ role: "administrator" }),
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
