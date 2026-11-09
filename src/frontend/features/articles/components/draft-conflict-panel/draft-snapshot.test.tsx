import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { baseDraft } from "@/shared/articles/draft-contract/draft-test-cases";
import { DraftSnapshot } from "./draft-snapshot";
it("previews canonical content as safe text and uses generic unavailable labels", () => {
  const { container } = render(
    <DraftSnapshot
      options={{ sections: [], categories: [], tags: [], contributors: [] }}
      input={{
        ...baseDraft,
        title: "<img src=x onerror=alert(1)>",
        categoryIds: [baseDraft.sectionId],
        content: {
          format: "gavel-draft",
          version: 1,
          document: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "Plain text" },
                  { type: "hardBreak" },
                  { type: "text", text: "<script>inert</script>" },
                ],
              },
            ],
          },
        },
      }}
    />,
  );
  expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeVisible();
  expect(container.querySelector("img,script")).toBeNull();
  expect(container.querySelector("pre")).toHaveTextContent(
    "Plain text <script>inert</script>",
  );
  expect(
    screen.getAllByText(
      new RegExp(`Unavailable selection: ${baseDraft.sectionId}`),
    ).length,
  ).toBeGreaterThan(0);
});
