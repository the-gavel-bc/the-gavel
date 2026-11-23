import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import AdminHomepagePage from "./page";

const mocks = vi.hoisted(() => ({
  editor: vi.fn(),
  curation: vi.fn(),
  images: vi.fn(),
}));
vi.mock("@/backend/auth/access/access", () => ({
  requireActiveMembership: async () => ({ role: "administrator" }),
}));
vi.mock("@/backend/homepage/homepage-curation/homepage-curation", () => ({
  getAdminHomepageCuration: mocks.curation,
}));
vi.mock("@/backend/homepage/homepage-curation/homepage-images", () => ({
  getHomepageImageUrls: mocks.images,
}));
vi.mock("@/backend/homepage/homepage-curation/homepage-stories-action", () => ({
  listHomepageStoriesAction: async () => ({
    ok: true,
    items: [],
    nextCursor: null,
  }),
}));
vi.mock(
  "@/frontend/features/homepage/components/admin-homepage/homepage-editor",
  () => ({
    HomepageEditor: (props: unknown) => {
      mocks.editor(props);
      return <p>Homepage editor</p>;
    },
  }),
);

it("passes only saved picks to the editor and lists automatic fillers separately", async () => {
  const chosen = { id: "chosen", title: "Chosen story", status: "published" };
  const removed = {
    id: "archived",
    title: "Archived pick",
    status: "archived",
  };
  const filler = { id: "automatic", title: "Automatic story" };
  mocks.curation.mockResolvedValue({
    version: 4,
    saved: { lead: removed, featured: [chosen], readThis: [] },
    effective: { lead: filler, featured: [chosen], readThis: [] },
  });
  mocks.images.mockResolvedValue({});
  render(await AdminHomepagePage());
  expect(screen.getByText("Homepage editor")).toBeVisible();
  expect(mocks.editor).toHaveBeenCalledWith(
    expect.objectContaining({
      version: 4,
      saved: {
        lead: expect.objectContaining(removed),
        featured: [expect.objectContaining(chosen)],
        readThis: [],
      },
      automatic: [{ ...filler, group: "lead" }],
    }),
  );
});
