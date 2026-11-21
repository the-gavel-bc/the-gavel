import { expect, test } from "@playwright/test";
import { draftListFixture } from "../support/draft-list-fixture/draft-list-fixture";
import { setLocalSession } from "../support/local-supabase/local-supabase";

test.describe.configure({ mode: "serial" });
let fixture: ReturnType<typeof draftListFixture>;
test.beforeAll(({}, info) => {
  fixture = draftListFixture(info.project.name, "lifecycle");
  fixture.setup();
  fixture.makePublishedReady();
});
test.afterAll(() => fixture?.cleanup());

test("review save bar keeps all actions on screen at phone widths", async ({
  context,
  page,
}) => {
  fixture.makeInReview(17);
  await setLocalSession(context, fixture.users.admin);
  await page.goto(`/dashboard/articles/${fixture.id(17)}`);
  const bar = page.locator("[data-draft-save-bar]");
  await expect(bar).toBeVisible();
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 900 });
    const save = page.getByRole("button", { name: "Save draft" });
    await expect(save).toBeVisible();
    const box = await save.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(
      await bar.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
  }
});

test("author submits and administrator publishes and archives with confirmation", async ({
  context,
  page,
}) => {
  const href = `/dashboard/articles/${fixture.id(21)}`;
  await setLocalSession(context, fixture.users.author);
  await page.goto(href);
  await expect(page.getByRole("heading", { name: "Edit draft" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Publish article" }),
  ).toHaveCount(0);
  const submit = page.getByRole("button", { name: "Submit for review" });
  await submit.focus();
  await expect(submit).toBeFocused();
  await submit.press("Enter");
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  expect(fixture.article(21).article.edit_version).toBe(1);
  await submit.click();
  await dialog.getByRole("button", { name: "Submit for review" }).click();
  await expect.poll(() => fixture.article(21).article.edit_version).toBe(2);

  await setLocalSession(context, fixture.users.admin);
  await page.goto(href);
  await page.getByRole("button", { name: "Publish article" }).click();
  await dialog.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Edit published article" }),
  ).toBeVisible();
  expect(fixture.article(21)).toMatchObject({
    article: { status: "published", edit_version: 3 },
    revisions: 2,
    audits: 2,
    receipts: 2,
  });
  await page.getByRole("button", { name: "Archive article" }).click();
  await dialog.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(
    page.getByText("This article is archived. Editing is unavailable."),
  ).toBeVisible();
  expect(fixture.article(21)).toMatchObject({
    article: { status: "archived", edit_version: 4 },
    revisions: 3,
    audits: 3,
    receipts: 3,
  });
});

test("unready draft cannot publish; other owner cannot open it", async ({
  browser,
  context,
  page,
}, info) => {
  await setLocalSession(context, fixture.users.admin);
  await page.goto(`/dashboard/articles/${fixture.id(18)}`);
  await page.getByRole("button", { name: "Publish article" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Publish", exact: true })
    .click();
  await expect(page.getByText(/not ready to publish/)).toBeVisible();
  expect(fixture.article(18).article.status).toBe("draft");
  const otherContext = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    viewport: page.viewportSize(),
    isMobile: info.project.name === "mobile",
    hasTouch: info.project.name === "mobile",
  });
  try {
    await setLocalSession(otherContext, fixture.users.other);
    const other = await otherContext.newPage();
    await other.goto(`/dashboard/articles/${fixture.id(18)}`);
    await expect(
      other.getByRole("button", { name: "Publish article" }),
    ).toHaveCount(0);
  } finally {
    await otherContext.close();
  }
});

test("unsupported old published body can still be archived", async ({
  context,
  page,
}) => {
  fixture.legacyPublished();
  await setLocalSession(context, fixture.users.admin);
  await page.goto(`/dashboard/articles/${fixture.id(20)}`);
  await expect(page.getByText(/body format is unsupported/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save article" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Archive article" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Archive", exact: true })
    .click();
  await expect(
    page.getByText("This article is archived. Editing is unavailable."),
  ).toBeVisible();
  expect(fixture.article(20)).toMatchObject({
    article: { status: "archived", edit_version: 2 },
    revisions: 1,
    audits: 1,
    receipts: 1,
  });
});
