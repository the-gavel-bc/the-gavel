import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { PreviewMeta } from "./preview-meta";

const owner = { displayName: "Owner Name", slug: "owner" };
it("shows writers and the UTC date side by side", () => {
  render(
    <PreviewMeta
      article={{
        owner,
        writers: [
          { displayName: "Avery Quinn", slug: "avery" },
          { displayName: "Sam Lee", slug: "sam" },
        ],
        publishedAt: "2026-11-13T23:30:00.000000Z",
      }}
    />,
  );
  expect(screen.getByText("Avery Quinn, Sam Lee")).toBeVisible();
  expect(screen.getByText("Nov 13, 2026")).toHaveAttribute(
    "datetime",
    "2026-11-13T23:30:00.000000Z",
  );
  expect(screen.queryByText("Owner Name")).toBeNull();
});

it("falls back to the article owner without credited writers", () => {
  render(
    <PreviewMeta
      article={{ owner, writers: [], publishedAt: "2026-11-13T00:00:00Z" }}
    />,
  );
  expect(screen.getByText("Owner Name")).toBeVisible();
});
