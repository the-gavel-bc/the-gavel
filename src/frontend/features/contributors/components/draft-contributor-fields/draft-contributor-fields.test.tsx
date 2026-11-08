import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it } from "vitest";
import type { DraftContributor } from "@/shared/articles/draft-contract/draft-contract";
import { DraftContributorFields } from "./draft-contributor-fields";
const options = [{ id: "guest", displayName: "Guest", slug: "guest" }];
function Form() {
  const [value, onChange] = useState<DraftContributor[]>([
    { profileId: "missing", role: "creative", displayOrder: 7 },
  ]);
  return (
    <>
      <DraftContributorFields
        value={value}
        options={options}
        onChange={onChange}
      />
      <output>{JSON.stringify(value)}</output>
    </>
  );
}
it("repairs an unavailable credit without renumbering existing credits", async () => {
  render(<Form />);
  expect(screen.getByLabelText("Contributor 1")).toHaveDisplayValue(
    /Unavailable contributor/,
  );
  await userEvent.selectOptions(
    screen.getByLabelText("Contributor 1"),
    "guest",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Add contributor" }),
  );
  await userEvent.selectOptions(screen.getByLabelText("Role 2"), "editor");
  await userEvent.clear(screen.getByLabelText("Display order 2"));
  await userEvent.type(screen.getByLabelText("Display order 2"), "7");
  expect(JSON.parse(screen.getByRole("status").textContent!)).toEqual([
    { profileId: "guest", role: "creative", displayOrder: 7 },
    { profileId: "guest", role: "editor", displayOrder: 7 },
  ]);
  await userEvent.click(
    screen.getByRole("button", { name: "Remove contributor 1" }),
  );
  expect(JSON.parse(screen.getByRole("status").textContent!)).toEqual([
    { profileId: "guest", role: "editor", displayOrder: 7 },
  ]);
});
it("allows removal with an empty catalog and caps addition at 32", () => {
  render(
    <DraftContributorFields
      value={Array.from({ length: 32 }, (_, i) => ({
        profileId: `missing-${i}`,
        role: "writer",
        displayOrder: 0,
      }))}
      options={[]}
      error="Repair credits"
      onChange={() => {}}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Add contributor" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Remove contributor 1" }),
  ).toBeEnabled();
  expect(
    screen.getByRole("group", { name: "Contributors" }),
  ).toHaveAccessibleDescription(/Repair credits/);
});
