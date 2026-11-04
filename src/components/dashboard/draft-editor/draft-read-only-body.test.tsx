import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { DraftReadOnlyBody } from "./draft-read-only-body";

it("renders canonical text and private images safely without JavaScript", () => {
  const html = renderToStaticMarkup(
    <DraftReadOnlyBody
      articleId="50000000-0000-0000-0000-000000000701"
      content={{
        format: "gavel-draft",
        version: 2,
        document: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "A <story>" }],
            },
            {
              type: "image",
              attrs: {
                assetId: "60000000-0000-0000-0000-000000000701",
                alt: "Newsroom image",
                caption: "On campus",
              },
            },
          ],
        },
      }}
    />,
  );
  expect(html).toContain("A &lt;story&gt;");
  expect(html).toContain('alt="Newsroom image"');
  expect(html).toContain(
    "/api/articles/50000000-0000-0000-0000-000000000701/media/60000000-0000-0000-0000-000000000701",
  );
  expect(html).toContain("On campus");
  expect(html).not.toContain("https://evil.example");
});
