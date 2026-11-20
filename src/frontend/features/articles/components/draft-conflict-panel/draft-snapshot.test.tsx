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
  expect(screen.getByText("Unavailable section 1")).toBeVisible();
  expect(screen.getByText(/Unavailable category 1/)).toBeVisible();
  expect(container).not.toHaveTextContent(baseDraft.sectionId);
});

it("distinguishes unavailable choices across both snapshots without showing IDs", () => {
  const lower = "00000000-0000-0000-0000-000000000011";
  const higher = "00000000-0000-0000-0000-000000000012";
  const local = { ...baseDraft, tagIds: [higher] };
  const saved = { ...baseDraft, tagIds: [lower] };
  const options = { sections: [], categories: [], tags: [], contributors: [] };
  const { container } = render(
    <>
      <DraftSnapshot input={local} options={options} comparison={saved} />
      <DraftSnapshot input={saved} options={options} comparison={local} />
    </>,
  );
  expect(screen.getByText(/Unavailable tag 1/)).toBeVisible();
  expect(screen.getByText(/Unavailable tag 2/)).toBeVisible();
  expect(container).not.toHaveTextContent(lower);
  expect(container).not.toHaveTextContent(higher);
});
