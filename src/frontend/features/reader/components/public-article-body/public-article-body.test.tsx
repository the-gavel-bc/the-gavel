import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PublicArticleBody } from "./public-article-body";
const articleId = "51000000-0000-0000-0000-000000000001";
const assetId = "61000000-0000-0000-0000-000000000001";
const content = {
  format: "gavel-draft",
  version: 2,
  document: {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Public story" }] },
      {
        type: "image",
        attrs: { assetId, alt: "Campus image", caption: "Caption <text>" },
      },
    ],
  },
};
it("uses only matching public descriptors with stable image dimensions", () => {
  render(
    <PublicArticleBody
      articleId={articleId}
      content={content}
      images={[{ id: assetId, width: 800, height: 600 }]}
    />,
  );
  expect(screen.getByRole("img", { name: "Campus image" })).toHaveAttribute(
    "src",
    `/api/public/articles/${articleId}/media/${assetId}`,
  );
  expect(screen.getByRole("img")).toHaveAttribute("width", "800");
  expect(screen.getByRole("img")).toHaveAttribute("height", "600");
  expect(screen.getByText("Caption <text>")).toBeVisible();
});
it("rejects missing, invalid and duplicate descriptors without partial text", () => {
  for (const images of [
    [],
    [{ id: assetId, width: -1, height: 600 }],
    [
      { id: assetId, width: 800, height: 600 },
      { id: assetId, width: 800, height: 600 },
    ],
  ]) {
    const html = renderToStaticMarkup(
      <PublicArticleBody
        articleId={articleId}
        content={content}
        images={images}
      />,
    );
    expect(html).toContain("Article content is unavailable.");
    expect(html).not.toContain("Public story");
    expect(html).not.toContain("<img");
  }
});
it("never renders a null published body as an editable empty draft", () => {
  expect(
    renderToStaticMarkup(
      <PublicArticleBody articleId={articleId} content={null} images={[]} />,
    ),
  ).toContain("Article content is unavailable.");
});
