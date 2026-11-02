import { expect, test } from "@playwright/test";
import { draftListFixture } from "../support/draft-list-fixture/draft-list-fixture";
import { setLocalSession } from "../support/local-supabase/local-supabase";
import { draftActionBarrier } from "../support/draft-action-barrier/draft-action-barrier";
test.describe.configure({ mode: "serial" });
let fixture: ReturnType<typeof draftListFixture>;
test.beforeAll(({}, info) => {
  fixture = draftListFixture(info.project.name, "save");
  fixture.setup();
  fixture.setupSelections();
});
test.afterAll(() => fixture?.cleanup());
test("late save preserves newer metadata body and associations until another explicit save", async ({
  context,
  page,
}, info) => {
  await setLocalSession(context, fixture.users.author);
  const path = `/dashboard/articles/${fixture.id(17)}`;
  await page.goto(path);
  const title = page.getByLabel("Title (required)"),
    body = page.getByRole("textbox", { name: "Article body" });
  await title.fill("First submitted snapshot");
  await body.fill("First body snapshot.");
  await page
    .getByLabel(`Synthetic ${info.project.name} category`, { exact: true })
    .check();
  const barrier = await draftActionBarrier(page, path);
  try {
    await page.getByRole("button", { name: "Save draft" }).click();
    await barrier.committed;
    // A repeated native submission cannot start a second request while one is pending.
    await page
      .locator("form")
      .filter({ has: page.getByLabel("Title (required)") })
      .evaluate((form) => {
        (form as HTMLFormElement).requestSubmit();
        (form as HTMLFormElement).requestSubmit();
      });
    await title.fill("Newer local title");
    await body.fill("Newer local body.");
    await page.getByLabel(fixture.topicName, { exact: true }).check();
    expect(fixture.article(17).article.title).toBe("First submitted snapshot");
    expect(fixture.selections(17).tags).toEqual([]);
    barrier.release();
    await expect(
      page.getByRole("status").filter({ hasText: "Unsaved changes" }),
    ).toBeVisible();
    await expect(title).toHaveValue("Newer local title");
    await expect(body).toHaveText("Newer local body.");
    expect(barrier.bodies).toHaveLength(1);
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Draft saved" }),
    ).toBeVisible();
    expect(JSON.parse(barrier.bodies[1])[0]).toMatchObject({
      expectedVersion: 2,
      draft: { title: "Newer local title" },
    });
    expect(fixture.article(17)).toMatchObject({
      article: { edit_version: 3, title: "Newer local title" },
      revisions: 2,
      audits: 2,
      receipts: 2,
    });
    expect(fixture.selections(17).tags).toEqual([fixture.id(95)]);
    await page.reload();
    await expect(body).toHaveText("Newer local body.");
  } finally {
    await barrier.dispose();
  }
});
test("lost save retries exactly through access loss while retaining newer invalid input", async ({
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.author);
  const path = `/dashboard/articles/${fixture.id(16)}`;
  await page.goto(path);
  const title = page.getByLabel("Title (required)"),
    body = page.getByRole("textbox", { name: "Article body" });
  await title.fill("Committed before dropped response");
  await expect(body).toBeVisible();
  const barrier = await draftActionBarrier(page, path, "drop");
  try {
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(
      page.getByRole("button", { name: "Retry original save" }),
    ).toBeVisible();
    await title.fill("Newest retained title");
    // Native schema permits these paragraphs, but the canonical 5,000-node bound rejects them.
    await body.evaluate((element) => {
      element.innerHTML =
        "<p>New invalid native text</p>" + "<p>x</p>".repeat(2500);
      element.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: "x",
        }),
      );
    });
    await expect(
      page.getByRole("alert").filter({ hasText: "exceeds its limits" }),
    ).toBeVisible();
    fixture.setAuthorAccess(false);
    await page.getByRole("button", { name: "Retry original save" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Your access" }),
    ).toBeVisible();
    fixture.setAuthorAccess(true);
    await page.getByRole("button", { name: "Retry original save" }).click();
    await expect(
      page.getByRole("button", { name: "Retry original save" }),
    ).toHaveCount(0);
    expect(barrier.bodies.slice(0, 3)).toEqual(
      Array(3).fill(barrier.bodies[0]),
    );
    await expect(title).toHaveValue("Newest retained title");
    await expect(
      page.getByRole("button", { name: "Save draft" }),
    ).toBeDisabled();
    expect(fixture.article(16)).toMatchObject({
      article: { title: "Committed before dropped response", edit_version: 2 },
      revisions: 1,
      audits: 1,
      receipts: 1,
    });
    await body.fill("A corrected newer body.");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Draft saved" }),
    ).toBeVisible();
    expect(JSON.parse(barrier.bodies[3])[0]).toMatchObject({
      expectedVersion: 2,
      draft: { title: "Newest retained title" },
    });
    expect(barrier.bodies[3]).not.toBe(barrier.bodies[0]);
    expect(fixture.article(16)).toMatchObject({
      revisions: 2,
      audits: 2,
      receipts: 2,
    });
  } finally {
    fixture.setAuthorAccess(true);
    await barrier.dispose();
  }
});
test("create success keeps newer edits on the mounted form and saves the same article", async ({
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.empty);
  await page.goto("/dashboard/articles/new");
  await page.getByLabel("Title (required)").fill("Create snapshot");
  await page.getByLabel("Section (required)").selectOption(fixture.id(99));
  await expect(
    page.getByRole("textbox", { name: "Article body" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create draft" }),
  ).toBeEnabled();
  const barrier = await draftActionBarrier(page, "/dashboard/articles/new");
  try {
    await page.getByRole("button", { name: "Create draft" }).click();
    await barrier.committed;
    await page
      .getByLabel("Title (required)")
      .fill("Newer than create snapshot");
    barrier.release();
    await expect(
      page.getByRole("button", { name: "Save draft" }),
    ).toBeEnabled();
    await expect(page).toHaveURL(/\/dashboard\/articles\/new$/);
    expect(fixture.createdCount()).toBe(1);
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page).toHaveURL(/\/dashboard\/articles\/[0-9a-f-]+$/);
    expect(barrier.bodies).toHaveLength(2);
    expect(JSON.parse(barrier.bodies[1])[0]).toMatchObject({
      expectedVersion: 1,
      draft: { title: "Newer than create snapshot" },
    });
    expect(fixture.createdCount()).toBe(1);
    expect(fixture.created("newer-than-create-snapshot")).toMatchObject({
      version: 2,
      revisions: 2,
      audits: 2,
      receipts: 2,
    });
  } finally {
    await barrier.dispose();
  }
});
for (const access of ["inactive", "signedOut"] as const)
  test(`category reads preserve unsaved input after ${access} access loss`, async ({
    context,
    page,
  }, info) => {
    await setLocalSession(context, fixture.users.author);
    const number = access === "inactive" ? 11 : 10;
    const path = `/dashboard/articles/${fixture.id(number)}`;
    await page.goto(path);
    const title = page.getByLabel("Title (required)"),
      body = page.getByRole("textbox", { name: "Article body" });
    await title.fill("Retain category access edits");
    await body.fill("Retain valid body text.");
    if (access === "inactive") {
      await body.evaluate((element) => {
        element.innerHTML =
          "<p>Retain invalid native text</p>" + "<p>x</p>".repeat(2500);
        element.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            inputType: "insertText",
            data: "x",
          }),
        );
      });
      await expect(
        page.getByRole("alert").filter({ hasText: "exceeds its limits" }),
      ).toBeVisible();
    }
    const before = fixture.article(number);
    if (access === "inactive") fixture.setAuthorAccess(false);
    else await context.clearCookies();
    try {
      await page.getByLabel("Section (required)").selectOption(fixture.id(98));
      await expect(
        page
          .getByRole("alert")
          .filter({ hasText: "Unable to load categories" }),
      ).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${fixture.id(number)}$`));
      await expect(title).toHaveValue("Retain category access edits");
      if (access === "inactive") {
        await expect(body.locator("p")).toHaveCount(2501);
        await expect(body.locator("p").first()).toHaveText(
          "Retain invalid native text",
        );
      } else await expect(body).toHaveText("Retain valid body text.");
      expect(fixture.article(number)).toEqual(before);
      if (access === "inactive") fixture.setAuthorAccess(true);
      else await setLocalSession(context, fixture.users.author);
      await page.getByRole("button", { name: "Retry categories" }).click();
      await expect(
        page.getByLabel(`Synthetic ${info.project.name} alternate category`, {
          exact: true,
        }),
      ).toBeVisible();
      await expect(title).toHaveValue("Retain category access edits");
    } finally {
      if (access === "inactive") fixture.setAuthorAccess(true);
    }
  });
