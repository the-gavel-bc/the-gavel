import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ action: vi.fn(), refresh: vi.fn() }));
vi.mock("@/backend/profiles/own-profile/own-profile-actions", () => ({
  saveOwnProfileAction: mocks.action,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
import { OwnProfileForm } from "./own-profile-form";
const profile = {
  displayName: "Writer",
  biography: null,
  slug: "writer",
  version: 1,
  slugFrozen: false,
};
beforeEach(() => vi.clearAllMocks());
it("retains an uncertain request through denied retries", async () => {
  mocks.action
    .mockResolvedValueOnce({ ok: false, code: "unavailable" })
    .mockResolvedValueOnce({ ok: false, code: "forbidden" })
    .mockResolvedValueOnce({
      ok: true,
      profileId: "82000000-0000-0000-0000-000000000001",
      slug: "writer",
      version: 2,
      changed: true,
      replayed: true,
    });
  render(<OwnProfileForm profile={profile} />);
  await userEvent.type(
    screen.getByLabelText("Public biography"),
    "My biography",
  );
  await userEvent.click(screen.getByRole("button", { name: "Save profile" }));
  await userEvent.click(
    await screen.findByRole("button", { name: "Retry original request" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Retry original request" }),
  );
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  expect(mocks.action.mock.calls[1][0]).toEqual(mocks.action.mock.calls[0][0]);
  expect(mocks.action.mock.calls[2][0]).toEqual(mocks.action.mock.calls[0][0]);
});
it("retains input and offers explicit reload on conflict", async () => {
  mocks.action.mockResolvedValue({ ok: false, code: "conflict" });
  render(<OwnProfileForm profile={profile} />);
  await userEvent.type(
    screen.getByLabelText("Public biography"),
    "Unsaved text",
  );
  await userEvent.click(screen.getByRole("button", { name: "Save profile" }));
  expect(
    await screen.findByRole("button", { name: "Reload profile" }),
  ).toBeVisible();
  expect(screen.getByLabelText("Public biography")).toHaveValue("Unsaved text");
});
