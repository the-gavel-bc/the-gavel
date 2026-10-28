import {
  act,
  render,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { baseDraft } from "@/lib/articles/draft-contract/draft-test-cases";
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  save: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  review: vi.fn(),
}));
vi.mock("@/lib/articles/draft-actions/draft-actions", () => ({
  createDraftAction: mocks.create,
  saveDraftAction: mocks.save,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("@/lib/articles/draft-reload-action/draft-reload-action", () => ({
  reviewDraftAction: mocks.review,
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
it("creates NULL optional metadata and opens the confirmed draft for editing", async () => {
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
  expect(screen.getByText("Unsaved changes.")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Create draft" }));
  await waitFor(() =>
    expect(mocks.push).toHaveBeenCalledWith(
      `/dashboard/articles/${baseDraft.sectionId}`,
    ),
  );
  expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
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
it("offers the exact original retry while fields remain editable", async () => {
  mocks.create.mockResolvedValue({ ok: false, code: "unavailable" });
  render(<DraftForm initialDraft={baseDraft} options={options} />);
  await userEvent.click(screen.getByRole("button", { name: "Create draft" }));
  expect(
    await screen.findByRole("button", { name: "Retry original save" }),
  ).toBeEnabled();
  expect(screen.getByLabelText(/Title/)).toBeEnabled();
  await userEvent.click(
    screen.getByRole("button", { name: "Retry original save" }),
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
  const leaving = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(leaving);
  expect(leaving.defaultPrevented).toBe(true);
});
it("requires deliberate removal of unavailable selections and submits selected credits/tags", async () => {
  mocks.create.mockResolvedValue({ ok: false, code: "slug_conflict" });
  render(
    <DraftForm
      initialDraft={{
        ...baseDraft,
        categoryIds: ["00000000-0000-0000-0000-000000000099"],
      }}
      options={{
        ...options,
        tags: [{ id: baseDraft.sectionId, name: "Topic" }],
        contributors: [
          { id: baseDraft.sectionId, displayName: "Guest", slug: "guest" },
        ],
      }}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Create draft" }));
  expect(screen.getByRole("alert")).toHaveTextContent(/remove or replace/i);
  expect(mocks.create).not.toHaveBeenCalled();
  await userEvent.click(screen.getByLabelText(/Unavailable category/));
  await userEvent.click(screen.getByLabelText("Topic"));
  await userEvent.click(
    screen.getByRole("button", { name: "Add contributor" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Create draft" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(/slug/i),
  );
  expect(screen.getByLabelText("Topic")).toBeChecked();
  expect(mocks.create.mock.calls[0][0].draft).toMatchObject({
    categoryIds: [],
    tagIds: [baseDraft.sectionId],
    contributors: [
      { profileId: baseDraft.sectionId, role: "writer", displayOrder: 0 },
    ],
  });
});
it("leaves unavailable-selection repair usable when there are no active sections", async () => {
  render(
    <DraftForm
      initialDraft={{
        ...baseDraft,
        categoryIds: ["00000000-0000-0000-0000-000000000099"],
      }}
      options={{ ...options, sections: [] }}
      article={{
        id: baseDraft.sectionId,
        version: 1,
        updatedAt: "2026-10-23T12:00:00Z",
      }}
    />,
  );
  expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
  expect(screen.getByLabelText(/Title/)).toBeEnabled();
  const unavailable = screen.getByLabelText(/Unavailable category/);
  expect(unavailable).toBeEnabled();
  await userEvent.click(unavailable);
  expect(
    screen.queryByLabelText(/Unavailable category/),
  ).not.toBeInTheDocument();
  await userEvent.type(screen.getByLabelText(/Title/), " retained");
  expect(screen.getByLabelText(/Title/)).toHaveValue(
    `${baseDraft.title} retained`,
  );
});

it("retains newer create input in the mounted form until a subsequent explicit save", async () => {
  let finish!: (value: unknown) => void;
  mocks.create.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  mocks.save.mockResolvedValue({
    ok: true,
    articleId: baseDraft.sectionId,
    version: 2,
    updatedAt: "2026-10-28T12:00:00Z",
    changed: true,
    replayed: false,
  });
  render(<DraftForm initialDraft={baseDraft} options={options} />);
  await userEvent.click(screen.getByRole("button", { name: "Create draft" }));
  expect(screen.getByLabelText(/Title/)).toBeEnabled();
  await userEvent.type(screen.getByLabelText(/Title/), " newest");
  await act(async () => {
    finish({
      ok: true,
      articleId: baseDraft.sectionId,
      version: 1,
      updatedAt: "2026-10-28T12:00:00Z",
      changed: true,
      replayed: false,
    });
  });
  expect(mocks.push).not.toHaveBeenCalled();
  expect(screen.getByLabelText(/Title/)).toHaveValue(
    `${baseDraft.title} newest`,
  );
  await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(mocks.push).toHaveBeenCalled());
  expect(mocks.create).toHaveBeenCalledOnce();
  expect(mocks.save.mock.calls[0][0]).toMatchObject({
    expectedVersion: 1,
    draft: { title: `${baseDraft.title} newest` },
  });
});

it("preserves conflict input until confirmed reload and then uses the reviewed version", async () => {
  mocks.save
    .mockResolvedValueOnce({ ok: false, code: "conflict" })
    .mockResolvedValueOnce({
      ok: true,
      articleId: baseDraft.sectionId,
      version: 3,
      updatedAt: "2026-10-28T12:00:00Z",
      changed: true,
      replayed: false,
    });
  mocks.review.mockResolvedValue({
    ok: true,
    detail: {
      kind: "editable",
      articleId: baseDraft.sectionId,
      version: 2,
      updatedAt: "2026-10-28T12:00:00Z",
      draft: { ...baseDraft, title: "Latest saved" },
      unavailableSelections: {
        sectionId: null,
        categoryIds: [],
        tagIds: [],
        contributorIds: [],
      },
    },
    options,
  });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(
    <DraftForm
      initialDraft={baseDraft}
      options={options}
      article={{
        id: baseDraft.sectionId,
        version: 1,
        updatedAt: "2026-10-28T12:00:00Z",
      }}
    />,
  );
  await userEvent.type(screen.getByLabelText(/Title/), " local");
  await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await userEvent.click(
    await screen.findByRole("button", { name: "Review latest saved version" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Load latest saved version" }),
  );
  expect(screen.getByLabelText(/Title/)).toHaveValue(
    `${baseDraft.title} local`,
  );
  confirm.mockReturnValue(true);
  await userEvent.click(
    screen.getByRole("button", { name: "Load latest saved version" }),
  );
  expect(screen.getByLabelText(/Title/)).toHaveValue("Latest saved");
  expect(screen.getByText(`${baseDraft.title} local`)).toBeVisible();
  await userEvent.type(screen.getByLabelText(/Title/), " reconciled");
  await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(mocks.save.mock.calls[1][0]).toMatchObject({
    expectedVersion: 2,
    draft: { title: "Latest saved reconciled" },
  });
  confirm.mockRestore();
});
