import { expect, test } from "@playwright/test";
import { draftListFixture } from "../support/draft-list-fixture/draft-list-fixture";
import { setLocalSession } from "../support/local-supabase/local-supabase";
test.describe.configure({ mode: "serial" });
let fixture: ReturnType<typeof draftListFixture>;
test.beforeAll(({}, info) => {
  fixture = draftListFixture(info.project.name, "select");
  fixture.setup();
  fixture.setupSelections();
});
test.afterAll(() => fixture?.cleanup());
test("creates and reopens categories tags and multiple guest credits", async ({
  context,
  page,
}, info) => {
  await setLocalSession(context, fixture.users.empty);
  await page.goto("/dashboard/articles/new");
  await page.getByLabel("Title (required)").fill("Synthetic selection draft");
  await page
    .getByLabel("Slug (required)")
    .fill(`task9-${info.project.name}-created`);
  await page.getByLabel("Section (required)").selectOption(fixture.id(99));
  const category = page.getByLabel(`Synthetic ${info.project.name} category`, {
    exact: true,
  });
  await expect(category).toBeVisible();
  await category.check();
  await page
    .getByLabel(`Synthetic ${info.project.name} topic`, { exact: true })
    .check();
  await page.getByRole("button", { name: "Add contributor" }).click();
  await page
    .getByLabel("Contributor 1", { exact: true })
    .selectOption(fixture.id(94));
  await page.getByRole("button", { name: "Add contributor" }).click();
  await page
    .getByLabel("Contributor 2", { exact: true })
    .selectOption(fixture.id(94));
  await page.getByLabel("Role 2", { exact: true }).selectOption("editor");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/dashboard\/articles\/[0-9a-f-]+$/);
  await page.reload();
  await expect(category).toBeChecked();
  await expect(
    page.getByLabel(`Synthetic ${info.project.name} topic`, { exact: true }),
  ).toBeChecked();
  for (const n of [1, 2]) {
    await expect(
      page.getByLabel(`Contributor ${n}`, { exact: true }),
    ).toHaveValue(fixture.id(94));
    await expect(
      page.getByLabel(`Display order ${n}`, { exact: true }),
    ).toHaveValue("0");
  }
  await expect(
    page.getByRole("textbox", { name: "Article body" }),
  ).toBeVisible();
  await page.screenshot({
    path: `docs/reviews/assets/phase-3-task9-${info.project.name}.png`,
    fullPage: true,
  });
});
test("section changes retain categories until explicit replacement and preserve body", async ({
  context,
  page,
}, info) => {
  await setLocalSession(context, fixture.users.author);
  await page.goto(`/dashboard/articles/${fixture.id(21)}`);
  const body = page.getByRole("textbox", { name: "Article body" });
  await body.fill("Keep this synthetic body through section changes.");
  await page
    .getByLabel(`Synthetic ${info.project.name} category`, { exact: true })
    .check();
  await page
    .getByLabel(`Synthetic ${info.project.name} topic`, { exact: true })
    .check();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Draft saved" }),
  ).toBeVisible();
  expect(fixture.selections()).toEqual({
    categories: [fixture.id(97)],
    tags: [fixture.id(95)],
    credits: [],
  });
  await page.getByLabel("Section (required)").selectOption(fixture.id(98));
  const replacement = page.getByLabel(
    `Synthetic ${info.project.name} alternate category`,
    { exact: true },
  );
  await expect(replacement).toBeVisible();
  const old = page.getByLabel(`Unavailable category: ${fixture.id(97)}`, {
    exact: true,
  });
  await expect(old).toBeChecked();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Review the highlighted" }),
  ).toContainText("remove or replace");
  expect(fixture.selections().categories).toEqual([fixture.id(97)]);
  await old.click();
  await expect(old).toHaveCount(0);
  await replacement.check();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Draft saved" }),
  ).toBeVisible();
  await page.reload();
  await expect(replacement).toBeChecked();
  await expect(body).toHaveText(
    "Keep this synthetic body through section changes.",
  );
  expect(fixture.selections().categories).toEqual([fixture.id(96)]);
});
for (const actor of ["author", "admin"] as const)
  test(`${actor} retains selections after post-load deactivation and can repair them`, async ({
    context,
    page,
  }, info) => {
    await setLocalSession(context, fixture.users[actor]);
    const number = actor === "author" ? 17 : 16;
    await page.goto(`/dashboard/articles/${fixture.id(number)}`);
    const category = page.getByLabel(
      `Synthetic ${info.project.name} category`,
      { exact: true },
    );
    await category.check();
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Draft saved" }),
    ).toBeVisible();
    await page
      .getByLabel("Title (required)")
      .fill(`Synthetic ${actor} retained input`);
    fixture.setCategoryActive(false);
    try {
      await page.getByRole("button", { name: "Save draft" }).click();
      await expect(
        page.getByRole("alert").filter({ hasText: "Review the highlighted" }),
      ).toContainText("active selections");
      await expect(category).toBeChecked();
      await expect(page.getByLabel("Title (required)")).toHaveValue(
        `Synthetic ${actor} retained input`,
      );
      // Definitive rejection does not write the edited title or silently strip the category.
      expect(fixture.article(number).article.title).not.toBe(
        `Synthetic ${actor} retained input`,
      );
      page.once("dialog", (dialog) => dialog.accept());
      await page.reload();
      const missing = page.getByLabel(
        `Unavailable category: ${fixture.id(97)}`,
        { exact: true },
      );
      await expect(missing).toBeChecked();
      await missing.click();
      await expect(missing).toHaveCount(0);
      await page.getByRole("button", { name: "Save draft" }).click();
      await expect(
        page.getByRole("status").filter({ hasText: "Draft saved" }),
      ).toBeVisible();
    } finally {
      fixture.setCategoryActive(true);
    }
  });
test("credited author B still cannot read or edit author A's draft", async ({
  context,
  page,
}) => {
  fixture.creditOther();
  await setLocalSession(context, fixture.users.other);
  const response = await page.goto(`/dashboard/articles/${fixture.id(21)}`);
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0);
});
