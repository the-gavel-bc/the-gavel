import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { HomeHero } from "./home-hero";
import { HomeLatest } from "../home-latest/home-latest";
import type { PublicArticleCard } from "@/shared/reader/article-card/article-card";

const card = (n: number): PublicArticleCard => ({
  id: `00000000-0000-0000-0000-00000000000${n}`,
  slug: `story-${n}`,
  title: `Story ${n}`,
  excerpt: "A long excerpt that should not appear on the lead.",
  publishedAt: "2026-11-16T12:00:00.000000Z",
  section: { name: "National", slug: "national" },
  owner: { displayName: "Owner", slug: "owner" },
  writers: [{ displayName: "Writer", slug: "writer" }],
  mainImage: null,
});

it("shows the lead as one big link with a section pill, headline and date", () => {
  render(<HomeHero article={card(1)} />);
  const link = screen.getByRole("link", { name: "Story 1" });
  expect(link).toHaveAttribute("href", "/articles/story-1");
  expect(screen.getByText("National")).toBeVisible();
  expect(
    screen.getByRole("heading", { level: 2, name: "Story 1" }),
  ).toBeVisible();
  expect(screen.getByText("November 16, 2026")).toBeVisible();
  expect(screen.queryByText(/long excerpt/)).not.toBeInTheDocument();
});

it("lists Latest with a visible heading, headline and date only", () => {
  render(<HomeLatest articles={[card(2), card(3)]} />);
  expect(screen.getByRole("heading", { name: "Latest" })).toBeVisible();
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(screen.getAllByText("November 16, 2026")).toHaveLength(2);
  expect(screen.queryByText(/long excerpt/)).not.toBeInTheDocument();
  expect(screen.queryByText("Writer")).not.toBeInTheDocument();
});
