import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ action: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock(
  "@/backend/contributors/contributor-command/contributor-actions",
  () => ({ manageContributorAction: mocks.action }),
);
import { ContributorControls } from "./contributor-controls";
const contributor = {
  id: "00000000-0000-4000-8000-000000000001",
  displayName: "Guest",
  slug: "guest",
  biography: null,
  active: true,
  version: 1,
  slugFrozen: false,
  linkedAccount: false,
  referencedLive: false,
};
const success = {
  ok: true,
  profileId: contributor.id,
  slug: "guest",
  version: 1,
  active: true,
  changed: false,
  replayed: false,
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.action.mockResolvedValue(success);
});
it("keeps controls usable after unchanged saves and same-version refresh", async () => {
  const view = render(<ContributorControls contributor={contributor} />);
  fireEvent.click(screen.getByRole("button", { name: "Save contributor" }));
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  view.rerender(<ContributorControls contributor={{ ...contributor }} />);
  expect(
    screen.getByRole("button", { name: "Save contributor" }),
  ).toBeEnabled();
  fireEvent.change(screen.getByLabelText("Public display name"), {
    target: { value: "Renamed" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save contributor" }));
  await waitFor(() => expect(mocks.action).toHaveBeenCalledTimes(2));
  expect(mocks.action.mock.calls[1][0]).toMatchObject({
    displayName: "Renamed",
    expectedVersion: 1,
  });
});
it("waits for refreshed props after changed saves", async () => {
  mocks.action.mockResolvedValue({ ...success, changed: true, version: 2 });
  const view = render(
    <ContributorControls key="1" contributor={contributor} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save contributor" }));
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  expect(
    screen.getByRole("button", { name: "Save contributor" }),
  ).toBeDisabled();
  view.rerender(
    <ContributorControls
      key="2"
      contributor={{ ...contributor, version: 2 }}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Save contributor" }),
  ).toBeEnabled();
});
it("blocks duplicate in-flight requests and retries the exact unavailable command", async () => {
  let finish!: (value: unknown) => void;
  mocks.action.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<ContributorControls contributor={contributor} />);
  const button = screen.getByRole("button", { name: "Save contributor" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(mocks.action).toHaveBeenCalledOnce();
  expect(button).toBeDisabled();
  await act(async () => finish({ ok: false, code: "unavailable" }));
  expect(screen.getByLabelText("Public display name")).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", { name: "Retry original request" }),
  );
  await waitFor(() => expect(mocks.action).toHaveBeenCalledTimes(2));
  expect(mocks.action.mock.calls[1][0]).toEqual(mocks.action.mock.calls[0][0]);
  await waitFor(() => expect(button).toBeEnabled());
});
it("keeps local edits after an authorization denial", async () => {
  mocks.action.mockResolvedValue({ ok: false, code: "forbidden" });
  render(<ContributorControls contributor={contributor} />);
  fireEvent.change(screen.getByLabelText("Public display name"), {
    target: { value: "Unsaved" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save contributor" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("access");
  expect(screen.getByLabelText("Public display name")).toHaveValue("Unsaved");
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it("does not expose inactive contributor mutations", () => {
  render(
    <ContributorControls contributor={{ ...contributor, active: false }} />,
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(mocks.action).not.toHaveBeenCalled();
});
