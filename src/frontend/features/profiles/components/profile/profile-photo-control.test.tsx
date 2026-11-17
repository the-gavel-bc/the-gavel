import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  remove: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/backend/profiles/profile-photo/profile-photo-actions", () => ({
  saveProfilePhotoAction: mocks.save,
  removeProfilePhotoAction: mocks.remove,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
import { ProfilePhotoControl } from "./profile-photo-control";

const file = (name: string, type: string, size = 10) =>
  new File([new Uint8Array(size)], name, { type });
beforeEach(() => vi.clearAllMocks());

it("uploads a valid image as one 'photo' field", async () => {
  mocks.save.mockResolvedValue({ ok: true });
  const { container } = render(
    <ProfilePhotoControl name="Writer" photoUrl={null} />,
  );
  expect(screen.getByRole("button", { name: "Add photo" })).toBeVisible();
  await userEvent.upload(
    container.querySelector("input[type=file]") as HTMLInputElement,
    file("me.png", "image/png"),
  );
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  const form = mocks.save.mock.calls[0][0] as FormData;
  expect([...form.keys()]).toEqual(["photo"]);
  expect(screen.getByText("Photo saved.")).toBeVisible();
});

it("rejects the wrong type or a large file before any request", async () => {
  const { container } = render(
    <ProfilePhotoControl name="Writer" photoUrl={null} />,
  );
  const input = container.querySelector("input[type=file]") as HTMLInputElement;
  await userEvent.upload(input, file("a.gif", "image/gif"), {
    applyAccept: false,
  });
  expect(screen.getByRole("alert")).toHaveTextContent("JPEG, PNG or WebP");
  await userEvent.upload(
    input,
    file("big.png", "image/png", 3 * 1024 * 1024 + 1),
  );
  expect(screen.getByRole("alert")).toHaveTextContent("3 MB");
  expect(mocks.save).not.toHaveBeenCalled();
});

it("shows the current photo and removes it only after confirming", async () => {
  mocks.remove.mockResolvedValue({ ok: true });
  render(
    <ProfilePhotoControl
      name="Writer"
      photoUrl="/api/public/profiles/w/photo?v=1"
    />,
  );
  expect(screen.getByRole("img", { name: "Photo of Writer" })).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Remove photo" }));
  await userEvent.click(
    await screen.findByRole("button", { name: "Keep photo" }),
  );
  expect(mocks.remove).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Remove photo" }));
  await userEvent.click(
    (await screen.findAllByRole("button", { name: "Remove photo" })).at(-1)!,
  );
  await waitFor(() => expect(mocks.remove).toHaveBeenCalledOnce());
});

it("reports a failed save", async () => {
  mocks.save.mockResolvedValue({ ok: false, code: "invalid_image" });
  const { container } = render(
    <ProfilePhotoControl name="Writer" photoUrl={null} />,
  );
  await userEvent.upload(
    container.querySelector("input[type=file]") as HTMLInputElement,
    file("me.png", "image/png"),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "could not be read",
  );
});
