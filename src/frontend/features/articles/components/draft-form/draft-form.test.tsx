import {
  act,
  render,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { baseDraft } from "@/shared/articles/draft-contract/draft-test-cases";
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  ensureTag: vi.fn(),
  save: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  review: vi.fn(),
  unused: vi.fn(),
  removeUnused: vi.fn(),
  finishMedia: null as (() => void) | null,
}));
vi.mock("@/backend/articles/draft-actions/draft-actions", () => ({
  createDraftAction: mocks.create,
  saveDraftAction: mocks.save,
}));
vi.mock("@/backend/taxonomy/ensure-tag/ensure-tag-action", () => ({
  ensureTagAction: mocks.ensureTag,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("@/backend/articles/draft-reload-action/draft-reload-action", () => ({
  reviewDraftAction: mocks.review,
}));
vi.mock("../article-media/article-media", () => ({
  ArticleMedia: ({
    onCommit,
    onBusyChange,
    initialFile,
  }: {
    initialFile?: File | null;
    onCommit: (result: {
      ok: true;
      articleId: string;
      version: number;
      updatedAt: string;
      replayed: boolean;
      changed: boolean;
    }) => void;
    onBusyChange: (busy: boolean) => void;
  }) => (
    <button
      type="button"
      onClick={() => {
        onBusyChange(true);
        mocks.finishMedia = () => {
          onCommit({
            ok: true,
            articleId: baseDraft.sectionId,
            version: 2,
            updatedAt: "2026-11-11T12:00:00Z",
            replayed: false,
            changed: true,
          });
          onBusyChange(false);
        };
      }}
    >
      Start deferred image write{initialFile ? `: ${initialFile.name}` : ""}
    </button>
  ),
}));
vi.mock("@/backend/media/media-actions/media-actions", () => ({
  requestArticleImageUpload: vi.fn(),
}));
vi.mock("@/backend/media/media-removal/media-removal", () => ({
  removeUnusedArticleImage: mocks.removeUnused,
}));
vi.mock(
  "@/backend/media/unused-article-uploads/unused-article-uploads",
  () => ({
    listUnusedArticleUploads: mocks.unused,
  }),
);
import { DraftForm } from "./draft-form";
const options = {
  sections: [{ id: baseDraft.sectionId, name: "Synthetic section" }],
  categories: [],
  tags: [],
  contributors: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.unused.mockResolvedValue({ ok: true, items: [], nextCursor: null });
});
it("requires title and section, then focuses a safe error summary", async () => {
  render(
    <DraftForm
      initialDraft={{ ...baseDraft, title: "", sectionId: "" }}
      options={options}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Create draft" }));
  expect(screen.getByRole("alert")).toHaveFocus();
  for (const name of [/Title/, /Section/])
    expect(screen.getByLabelText(name)).toHaveAttribute("aria-invalid", "true");
  expect(screen.queryByLabelText(/Slug/)).not.toBeInTheDocument();
  expect(mocks.create).not.toHaveBeenCalled();
});
it("preserves the title if address allocation fails", async () => {
  mocks.create.mockResolvedValue({ ok: false, code: "slug_conflict" });
  render(<DraftForm initialDraft={baseDraft} options={options} />);
  await userEvent.click(screen.getByRole("button", { name: "Create draft" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(/article address/i),
  );
  expect(screen.getByLabelText(/Title/)).toHaveValue(baseDraft.title);
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
  await userEvent.type(screen.getByLabelText("Add tag"), "Topic{Enter}");
  await userEvent.click(
    screen.getByRole("button", { name: "Add contributor" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Create draft" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(/article address/i),
  );
  expect(
    screen.getByRole("button", { name: "Remove tag Topic" }),
  ).toBeVisible();
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
      status: "draft",
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
  expect(screen.getByLabelText(/Title/)).toHaveFocus();
  expect(screen.getByText(`${baseDraft.title} local`)).toBeVisible();
  await userEvent.type(screen.getByLabelText(/Title/), " reconciled");
  await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(mocks.save.mock.calls[1][0]).toMatchObject({
    expectedVersion: 2,
    draft: { title: "Latest saved reconciled" },
  });
  confirm.mockRestore();
});

it("toolbar correction does not clear an independent invalid native body", async () => {
  render(<DraftForm initialDraft={baseDraft} options={options} />);
  const body = await screen.findByRole("textbox", { name: "Article body" });
  const paste = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(paste, "clipboardData", {
    value: {
      files: [],
      types: ["text/html"],
      getData: () => "<b>Rejected</b>",
    },
  });
  fireEvent(body, paste);
  expect(screen.getByRole("button", { name: "Create draft" })).toBeDisabled();
  const input = screen.getByLabelText("Link URL");
  await userEvent.type(input, "javascript:bad");
  await userEvent.click(screen.getByRole("button", { name: "Apply link" }));
  await userEvent.clear(input);
  expect(screen.getByRole("button", { name: "Create draft" })).toBeDisabled();
  expect(mocks.create).not.toHaveBeenCalled();
});

it.each(["draft", "published"] as const)(
  "exposes explicit unused cleanup on %s articles",
  async (status) => {
    render(
      <DraftForm
        initialDraft={baseDraft}
        options={options}
        status={status}
        article={{
          id: baseDraft.sectionId,
          version: 1,
          updatedAt: "2026-11-11T12:00:00Z",
        }}
      />,
    );
    expect(
      await screen.findByRole("region", { name: "Unused uploads" }),
    ).toBeVisible();
    await waitFor(() =>
      expect(mocks.unused).toHaveBeenCalledWith(baseDraft.sectionId),
    );
  },
);

it("holds save, editing, lifecycle, and navigation guards during explicit cleanup", async () => {
  const assetId = "60000000-0000-0000-0000-000000000401";
  mocks.unused.mockResolvedValue({
    ok: true,
    items: [
      { assetId, createdAt: "2026-11-11T12:00:00Z", status: "finalized" },
    ],
    nextCursor: null,
  });
  let finish!: (value: { ok: true; assetId: string }) => void;
  mocks.removeUnused.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(
    <DraftForm
      initialDraft={baseDraft}
      options={options}
      article={{
        id: baseDraft.sectionId,
        version: 1,
        updatedAt: "2026-11-11T12:00:00Z",
      }}
    />,
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Discard unused upload" }),
  );
  expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Publish article" }),
  ).toBeDisabled();
  expect(screen.getByLabelText(/Title/)).toBeDisabled();
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  await act(async () => finish({ ok: true, assetId }));
  expect(screen.getByRole("button", { name: "Publish article" })).toBeEnabled();
});

it("keeps lifecycle, save and navigation guarded across uncertain cleanup until explicit recovery", async () => {
  const assetId = "60000000-0000-0000-0000-000000000401";
  mocks.unused.mockResolvedValue({
    ok: true,
    items: [
      { assetId, createdAt: "2026-11-11T12:00:00Z", status: "finalized" },
    ],
    nextCursor: null,
  });
  mocks.removeUnused
    .mockResolvedValueOnce({ ok: false, code: "unavailable" })
    .mockResolvedValueOnce({ ok: false, code: "not_found" });
  render(
    <DraftForm
      initialDraft={baseDraft}
      options={options}
      article={{
        id: baseDraft.sectionId,
        version: 1,
        updatedAt: "2026-11-11T12:00:00Z",
      }}
    />,
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Discard unused upload" }),
  );
  await screen.findByRole("button", { name: "Retry cleanup" });
  expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Publish article" }),
  ).toBeDisabled();
  expect(screen.getByLabelText(/Title/)).toBeDisabled();
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  mocks.unused.mockResolvedValue({ ok: true, items: [], nextCursor: null });
  await userEvent.click(
    screen.getByRole("button", { name: "Refresh unused uploads" }),
  );
  await screen.findByText(/Refreshing does not confirm deletion/);
  expect(
    screen.getByRole("button", { name: "Publish article" }),
  ).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Retry cleanup" }));
  expect(
    await screen.findByText(/This does not confirm deletion/),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Publish article" })).toBeEnabled();
});

it("retains input and blocks stale save mode when recovery finds a published article", async () => {
  mocks.save.mockResolvedValue({ ok: false, code: "conflict" });
  mocks.review.mockResolvedValue({
    ok: true,
    detail: {
      kind: "editable",
      status: "published",
      articleId: baseDraft.sectionId,
      version: 3,
      updatedAt: "2026-11-11T12:00:00Z",
      draft: { ...baseDraft, title: "Published elsewhere" },
      unavailableSelections: {
        sectionId: null,
        categoryIds: [],
        tagIds: [],
        contributorIds: [],
      },
    },
    options,
  });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  try {
    const view = render(
      <DraftForm
        initialDraft={{
          ...baseDraft,
          content: {
            format: "gavel-draft",
            version: 1,
            document: {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Local body retained" }],
                },
              ],
            },
          },
        }}
        options={options}
        article={{
          id: baseDraft.sectionId,
          version: 1,
          updatedAt: "2026-11-10T12:00:00Z",
        }}
      />,
    );
    await screen.findByRole("textbox", { name: "Article body" });
    await userEvent.type(screen.getByLabelText(/Title/), " local");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Review latest saved version",
      }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Load latest saved version" }),
    );
    expect(
      screen.getByRole("region", { name: "Article status changed" }),
    ).toHaveTextContent("now published");
    expect(screen.getByLabelText(/Title/)).toHaveValue(
      `${baseDraft.title} local`,
    );
    expect(
      screen.getByRole("textbox", { name: "Article body" }),
    ).toHaveTextContent("Local body retained");
    expect(
      screen.getByRole("button", { name: "Reload article" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    fireEvent.submit(view.container.querySelector("form")!);
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.refresh).not.toHaveBeenCalled();
    const leaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(true);
  } finally {
    confirm.mockRestore();
  }
});
it("does not offer snapshot adoption while a save is uncertain", async () => {
  mocks.save.mockResolvedValue({ ok: false, code: "unavailable" });
  render(
    <DraftForm
      initialDraft={baseDraft}
      options={options}
      article={{
        id: baseDraft.sectionId,
        version: 1,
        updatedAt: "2026-11-10T12:00:00Z",
      }}
    />,
  );
  await userEvent.type(screen.getByLabelText(/Title/), " pending");
  await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(
    await screen.findByRole("button", { name: "Retry original save" }),
  ).toBeEnabled();
  expect(
    screen.queryByRole("button", { name: "Review latest saved version" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Reload article" }),
  ).not.toBeInTheDocument();
  expect(mocks.review).not.toHaveBeenCalled();
});

it("keeps title edits while an image write completes and saves using its new version", async () => {
  mocks.save.mockResolvedValue({
    ok: true,
    articleId: baseDraft.sectionId,
    version: 3,
    updatedAt: "2026-11-11T12:01:00Z",
    replayed: false,
    changed: true,
  });
  render(
    <DraftForm
      initialDraft={baseDraft}
      article={{
        id: baseDraft.sectionId,
        version: 1,
        updatedAt: "2026-11-11T11:00:00Z",
      }}
      options={options}
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Start deferred image write" }),
  );
  const title = screen.getByLabelText(/Title/);
  await userEvent.clear(title);
  await userEvent.type(title, "Typed while image saves");
  expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
  fireEvent.submit(
    screen.getByRole("button", { name: "Save draft" }).closest("form")!,
  );
  expect(mocks.save).not.toHaveBeenCalled();
  act(() => mocks.finishMedia?.());
  expect(title).toHaveValue("Typed while image saves");
  await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedVersion: 2,
        draft: expect.objectContaining({ title: "Typed while image saves" }),
      }),
    ),
  );
});

it.each(["conflict", "request_conflict"] as const)(
  "offers review after an uncertain save resolves to %s",
  async (code) => {
    mocks.save
      .mockResolvedValueOnce({ ok: false, code: "unavailable" })
      .mockResolvedValueOnce({ ok: false, code });
    render(
      <DraftForm
        initialDraft={baseDraft}
        options={options}
        article={{
          id: baseDraft.sectionId,
          version: 1,
          updatedAt: "2026-11-11T12:00:00Z",
        }}
      />,
    );
    await userEvent.type(screen.getByLabelText(/Title/), " retained");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Retry original save" }),
    );
    expect(
      await screen.findByRole("button", {
        name: "Review latest saved version",
      }),
    ).toBeEnabled();
    expect(screen.getByLabelText(/Title/)).toHaveValue(
      `${baseDraft.title} retained`,
    );
    expect(
      screen.queryByRole("button", { name: "Retry original save" }),
    ).toBeNull();
  },
);
it("creates the draft in place when a photo is chosen first, then hands the photo over", async () => {
  mocks.create.mockResolvedValue({
    ok: true,
    articleId: baseDraft.sectionId,
    version: 1,
    updatedAt: "2026-10-23T12:00:00Z",
    replayed: false,
    changed: true,
  });
  const replace = vi.spyOn(window.history, "replaceState");
  render(<DraftForm initialDraft={baseDraft} options={options} />);
  await userEvent.upload(
    screen.getByLabelText("Image file"),
    new File(["synthetic"], "cover.png", { type: "image/png" }),
  );
  expect(
    await screen.findByRole("button", {
      name: "Start deferred image write: cover.png",
    }),
  ).toBeVisible();
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(replace).toHaveBeenCalledWith(
    null,
    "",
    `/dashboard/articles/${baseDraft.sectionId}`,
  );
  expect(mocks.push).not.toHaveBeenCalled();
  expect(screen.getByLabelText(/Title/)).toBeEnabled();
  replace.mockRestore();
});
it("keeps a chosen photo and does not create when required fields are missing", async () => {
  render(
    <DraftForm initialDraft={{ ...baseDraft, title: "" }} options={options} />,
  );
  await userEvent.upload(
    screen.getByLabelText("Image file"),
    new File(["synthetic"], "cover.png", { type: "image/png" }),
  );
  expect(
    await screen.findByText(/cover.png will upload once the draft is saved/),
  ).toBeVisible();
  expect(mocks.create).not.toHaveBeenCalled();
});

const newTag = {
  id: "d9000000-0000-0000-0000-000000000001",
  name: "New tag",
  slug: "new-tag",
};
it("creates a draft with a server-created tag while retaining newer title edits", async () => {
  let finish!: (value: unknown) => void;
  mocks.ensureTag.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  mocks.create.mockResolvedValue({ ok: false, code: "unavailable" });
  const view = render(<DraftForm initialDraft={baseDraft} options={options} />);
  await userEvent.type(screen.getByLabelText("Add tag"), newTag.name);
  await userEvent.keyboard("{Enter}");
  await userEvent.type(screen.getByLabelText(/Title/), " newest");
  await act(async () => finish({ ...newTag, ok: true, created: true }));
  await screen.findByRole("button", { name: `Remove tag ${newTag.name}` });
  await userEvent.click(screen.getByRole("button", { name: "Create draft" }));
  await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
  const saved = mocks.create.mock.calls[0][0].draft;
  expect(saved).toMatchObject({
    title: baseDraft.title + " newest",
    tagIds: [newTag.id],
  });
  view.unmount();
  render(
    <DraftForm initialDraft={saved} options={{ ...options, tags: [newTag] }} />,
  );
  expect(
    screen.getByRole("button", { name: `Remove tag ${newTag.name}` }),
  ).toBeVisible();
});

it("ignores a pending tag response after explicitly adopting a conflict snapshot", async () => {
  let finish!: (value: unknown) => void;
  mocks.ensureTag.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  mocks.save
    .mockResolvedValueOnce({ ok: false, code: "conflict" })
    .mockResolvedValue({ ok: false, code: "unavailable" });
  mocks.review.mockResolvedValue({
    ok: true,
    detail: {
      kind: "editable",
      status: "draft",
      articleId: baseDraft.sectionId,
      version: 2,
      updatedAt: "2026-11-12T12:00:00Z",
      draft: { ...baseDraft, title: "Adopted snapshot" },
      unavailableSelections: {
        sectionId: null,
        categoryIds: [],
        tagIds: [],
        contributorIds: [],
      },
    },
    options,
  });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  try {
    render(
      <DraftForm
        initialDraft={baseDraft}
        options={options}
        article={{
          id: baseDraft.sectionId,
          version: 1,
          updatedAt: "2026-11-12T12:00:00Z",
        }}
      />,
    );
    await userEvent.type(screen.getByLabelText(/Title/), " local");
    await userEvent.type(screen.getByLabelText("Add tag"), newTag.name);
    await userEvent.keyboard("{Enter}");
    expect(mocks.ensureTag).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Review latest saved version",
      }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Load latest saved version" }),
    );
    expect(screen.getByLabelText(/Title/)).toHaveValue("Adopted snapshot");
    await act(async () => finish({ ...newTag, ok: true, created: true }));
    expect(
      screen.queryByRole("button", { name: `Remove tag ${newTag.name}` }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Add tag")).toBeEnabled();
    await userEvent.type(screen.getByLabelText(/Title/), " reconciled");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.save.mock.calls[1][0]).toMatchObject({
      expectedVersion: 2,
      draft: { title: "Adopted snapshot reconciled", tagIds: [] },
    });
  } finally {
    confirm.mockRestore();
  }
});
