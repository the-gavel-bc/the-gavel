import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ReviewQueue } from "./review-queue";

const item = {
  id: "00000000-0000-0000-0000-000000000001",
  title: "Campus news",
  status: "draft" as const,
  ownerName: "Ada Writer",
  sectionName: "News",
  at: "2026-11-17T15:00:00.000000Z",
};
it("lists submissions to review and the editor's own publications", () => {
  render(
    <ReviewQueue
      items={[
        item,
        { ...item, id: "p", title: "Live story", status: "published" },
      ]}
    />,
  );
  expect(
    screen.getByRole("link", { name: "Review: Campus news" }),
  ).toHaveAttribute("href", `/dashboard/articles/${item.id}`);
  expect(screen.getByRole("link", { name: "Open: Live story" })).toBeVisible();
  expect(screen.getAllByText("By Ada Writer")).toHaveLength(2);
});
it("says so when nothing waits", () => {
  render(<ReviewQueue items={[]} />);
  expect(screen.getByText("Nothing is waiting for review.")).toBeVisible();
});
