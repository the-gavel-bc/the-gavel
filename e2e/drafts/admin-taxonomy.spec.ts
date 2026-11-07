import { expect, test } from "@playwright/test";
import { draftListFixture } from "../support/draft-list-fixture/draft-list-fixture";
import { setLocalSession } from "../support/local-supabase/local-supabase";

test.describe.configure({ mode: "serial" });
let fixture: ReturnType<typeof draftListFixture>;
test.beforeAll(({}, info) => {
  fixture = draftListFixture(info.project.name, "taxonomy");
  fixture.setup();
  fixture.setupSelections();
});
test.afterAll(() => fixture?.cleanup());

test("administrator edits existing taxonomy and sees gated tags", async ({
  context,
  page,
}, info) => {
  await setLocalSession(context, fixture.users.admin);
  await page.goto("/dashboard/admin/taxonomy");
  const name = `Synthetic ${info.project.name} taxonomy alternate`;
  const section = page.getByRole("listitem").filter({ hasText: name });
  await expect(section.getByLabel("Name")).toBeVisible();
  await expect(section.getByLabel("Slug")).toHaveCount(0);
  await section.getByLabel("Name").fill(`${name} revised`);
  await section.getByLabel("Navigation order").fill("3");
  await section.getByRole("button", { name: `Save ${name}` }).click();
  await expect(
    page.getByRole("heading", { name: `${name} revised` }),
  ).toBeVisible();
  await page.getByLabel("Catalog").selectOption("category");
  await page.getByRole("button", { name: "Show catalog" }).click();
  const categoryName = `Synthetic ${info.project.name} category`;
  const category = page.getByRole("listitem").filter({ hasText: categoryName });
  await category.getByLabel("Name").fill(`${categoryName} revised`);
  await category.getByRole("button", { name: `Save ${categoryName}` }).click();
  await expect(
    page.getByRole("heading", { name: `${categoryName} revised` }),
  ).toBeVisible();
  await page.getByLabel("Catalog").selectOption("tag");
  await page.getByRole("button", { name: "Show catalog" }).click();
  await expect(page.getByText(/Tag creation and renaming await/)).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: `Synthetic ${info.project.name} taxonomy topic`,
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Save/ })).toHaveCount(0);
});
test("author cannot manage taxonomy and invalid cursor can be reset", async ({
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.author);
  await page.goto("/dashboard/admin/taxonomy");
  await expect(page.getByText("Administrator access required.")).toBeVisible();
  await setLocalSession(context, fixture.users.admin);
  await page.goto("/dashboard/admin/taxonomy?cursor=bad");
  await expect(page.getByText("Unable to load taxonomy.")).toBeVisible();
  await page.getByRole("link", { name: "Reset filter" }).click();
  await expect(page.getByRole("heading", { name: "Taxonomy" })).toBeVisible();
});
