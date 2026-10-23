import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { baseDraft } from "@/lib/articles/draft-contract/draft-test-cases";
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  save: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/articles/draft-actions/draft-actions", () => ({
  createDraftAction: mocks.create,
  saveDraftAction: mocks.save,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
import { DraftForm } from "./draft-form";
const options = {
  sections: [{ id: baseDraft.sectionId, name: "Synthetic section" }],
  categories: [],
  tags: [],
  contributors: [],
};
beforeEach(() => {
  vi.clearAllMocks();
});
it("requires title, section and canonical slug, focuses a safe error summary", async () => {
  render(
    <DraftForm
      initialDraft={{ ...baseDraft, title: "", slug: "", sectionId: "" }}
      options={options}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Create draft" }));
  expect(screen.getByRole("alert")).toHaveFocus();
  for (const name of [/Title/, /Slug/, /Section/])
    expect(screen.getByLabelText(name)).toHaveAttribute("aria-invalid", "true");
  expect(mocks.create).not.toHaveBeenCalled();
});
it("preserves input on slug collision and never silently renames it", async () => {
  mocks.create.mockResolvedValue({ ok: false, code: "slug_conflict" });
  render(<DraftForm initialDraft={baseDraft} options={options} />);
  await userEvent.click(screen.getByRole("button", { name: "Create draft" }));
  await waitFor(() =>
    expect(screen.getByLabelText(/Slug/)).toHaveAccessibleDescription(
      /already in use/,
    ),
  );
  expect(screen.getByLabelText(/Slug/)).toHaveValue(baseDraft.slug);
  expect(mocks.push).not.toHaveBeenCalled();
});
it("creates NULL optional metadata and returns confirmed success to My Articles", async () => {
  mocks.create.mockResolvedValue({
    ok: true,
    articleId: baseDraft.sectionId,
    version: 1,
    updatedAt: "2026-10-23T12:00:00Z",
    replayed: false,
    changed: true,
  });
  render(<DraftForm initialDraft={baseDraft} options={options} />);
  await userEvent.type(screen.getByLabelText(/Title/), " updated");
  expect(screen.getByRole("status")).toHaveTextContent("Unsaved changes");
  await userEvent.click(screen.getByRole("button", { name: "Create draft" }));
  await waitFor(() =>
    expect(mocks.push).toHaveBeenCalledWith(
      `/dashboard/articles/${baseDraft.sectionId}`,
    ),
  );
  expect(screen.getByRole("button", { name: "Create draft" })).toBeDisabled();
  expect(screen.getByLabelText(/Title/)).toBeDisabled();
  expect(mocks.create.mock.calls[0][0].draft).toMatchObject({
    excerpt: null,
    seoKeyphrase: null,
    metaDescription: null,
    content: null,
    categoryIds: [],
    tagIds: [],
    contributors: [],
  });
});
it("offers exact retry and locks fields while the result is uncertain", async () => {
  mocks.create.mockResolvedValue({ ok: false, code: "unavailable" });
  render(<DraftForm initialDraft={baseDraft} options={options} />);
  await userEvent.click(screen.getByRole("button", { name: "Create draft" }));
  expect(
    await screen.findByRole("button", { name: "Retry same request" }),
  ).toBeEnabled();
  expect(screen.getByLabelText(/Title/)).toBeDisabled();
  await userEvent.click(
    screen.getByRole("button", { name: "Retry same request" }),
  );
  expect(mocks.create.mock.calls[1][0]).toEqual(mocks.create.mock.calls[0][0]);
});
it("does not invent a section when the active catalog is empty", () => {
  render(
    <DraftForm
      initialDraft={baseDraft}
      options={{ ...options, sections: [] }}
    />,
  );
  expect(screen.getByText(/No active sections/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Create draft" })).toBeDisabled();
});

it("blocks submission after the editor rejects a paste instead of saving the old body", async () => {
  const { container } = render(
    <DraftForm initialDraft={baseDraft} options={options} />,
  );
  const body = await screen.findByRole("textbox", { name: "Article body" });
  const paste = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(paste, "clipboardData", {
    value: {
      files: [],
      getData: (type: string) =>
        type === "text/html" ? "<img src=x>" : "text",
    },
  });
  fireEvent(body, paste);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Create draft" })).toBeDisabled(),
  );
  fireEvent.submit(container.querySelector("form")!);
  expect(mocks.create).not.toHaveBeenCalled();
});
