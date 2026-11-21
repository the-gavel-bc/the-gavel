import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { MediaCleanupControl } from "./media-cleanup-control";

const mocks = vi.hoisted(() => ({ retry: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/backend/media/retired-media-cleanup/cleanup-actions", () => ({
  retryMediaCleanupAction: mocks.retry,
}));

it("allows retry when the cleanup action throws", async () => {
  mocks.retry
    .mockRejectedValueOnce(new Error("connection closed"))
    .mockResolvedValueOnce({ ok: true });
  render(<MediaCleanupControl />);
  await userEvent.click(
    screen.getByRole("button", { name: "Run cleanup check" }),
  );
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Cleanup check failed",
  );
  const retry = screen.getByRole("button", { name: "Run cleanup check" });
  expect(retry).toBeEnabled();
  await userEvent.click(retry);
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Cleanup check completed",
  );
  expect(mocks.refresh).toHaveBeenCalledOnce();
});
