import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { AuthorBiography } from "./author-biography";
import { ArchiveGrid } from "../archive-grid/archive-grid";
const author = {
  displayName: "Guest Writer",
  slug: "guest-writer",
  biography: "Literal <script>alert(1)</script>\nSecond paragraph",
  photoUrl: null,
};
it("renders a biography as escaped plain text inside the archive introduction", () => {
  render(
    <ArchiveGrid
      introduction={<AuthorBiography author={author} />}
      result={{
        kind: "ok",
        archive: {
          title: author.displayName,
          section: null,
          category: null,
          isLetters: false,
          href: `/authors/${author.slug}`,
        },
        items: [],
        nextCursor: null,
        continuation: false,
      }}
    />,
  );
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    author.displayName,
  );
  expect(
    screen.getByRole("region", { name: "About Guest Writer" }),
  ).toHaveTextContent("Literal <script>alert(1)</script>");
  expect(document.querySelector("script")).toBeNull();
  expect(screen.getByText("No articles yet")).toBeVisible();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
it("omits absent biography without invented copy or profile images", () => {
  const { container } = render(
    <AuthorBiography author={{ ...author, biography: null }} />,
  );
  expect(container).toBeEmptyDOMElement();
});

it("shows a photo with the biography, or the photo alone", () => {
  const photoUrl = "/api/public/profiles/guest-writer/photo?v=1";
  const { rerender } = render(
    <AuthorBiography author={{ ...author, photoUrl }} />,
  );
  expect(
    screen.getByRole("img", { name: "Photo of Guest Writer" }),
  ).toHaveAttribute("src", photoUrl);
  rerender(
    <AuthorBiography author={{ ...author, biography: null, photoUrl }} />,
  );
  expect(
    screen.getByRole("img", { name: "Photo of Guest Writer" }),
  ).toBeVisible();
  rerender(<AuthorBiography author={{ ...author, biography: null }} />);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.queryByText("Biography")).not.toBeInTheDocument();
});
