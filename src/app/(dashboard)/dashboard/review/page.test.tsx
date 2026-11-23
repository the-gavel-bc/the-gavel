import { render, screen, within } from "@testing-library/react";
import { redirect } from "next/navigation";
import { beforeEach, expect, it, vi } from "vitest";
import ReviewPage from "./page";

const queue = vi.hoisted(() => vi.fn());
vi.mock("@/backend/articles/review-queue/review-queue", () => ({
  getReviewQueue: queue,
}));

const at = "2026-01-15T02:30:00Z";
const item = { ownerName: "Reporter", sectionName: "News", at };
const draftId = "00000000-0000-0000-0000-000000000041";
const publishedId = "00000000-0000-0000-0000-000000000042";

beforeEach(() => queue.mockReset());

it("puts submissions and the editor's publications in separate groups", async () => {
  queue.mockResolvedValue([
    {
      ...item,
      id: publishedId,
      title: "Already published",
      status: "published",
    },
    { ...item, id: draftId, title: "Waiting story", status: "draft" },
  ]);
  render(await ReviewPage());
  const waiting = within(
    screen.getByRole("region", { name: "Waiting for review" }),
  );
  const published = within(
    screen.getByRole("region", { name: "Published by you" }),
  );
  expect(
    waiting.getByRole("link", { name: "Review: Waiting story" }),
  ).toHaveAttribute("href", `/dashboard/articles/${draftId}`);
  expect(
    published.getByRole("link", { name: "Open: Already published" }),
  ).toHaveAttribute("href", `/dashboard/articles/${publishedId}`);
  expect(waiting.getByText(/Jan 14, 2026/)).toHaveAttribute("datetime", at);
  expect(waiting.queryByText("Already published")).not.toBeInTheDocument();
});

it("shows both empty states for an empty queue", async () => {
  queue.mockResolvedValue([]);
  render(await ReviewPage());
  expect(screen.getByText("Nothing is waiting for review.")).toBeVisible();
  expect(
    screen.getByText("You have not published anything yet."),
  ).toBeVisible();
});

it("reports a safe failure and preserves Next redirects", async () => {
  queue.mockRejectedValueOnce(new Error("private backend diagnostic"));
  render(await ReviewPage());
  expect(screen.getByRole("alert")).toHaveTextContent(/Unable to load/);
  expect(
    screen.queryByText("private backend diagnostic"),
  ).not.toBeInTheDocument();
  queue.mockImplementationOnce(() => redirect("/dashboard"));
  await expect(ReviewPage()).rejects.toMatchObject({
    digest: expect.stringContaining("NEXT_REDIRECT"),
  });
});
