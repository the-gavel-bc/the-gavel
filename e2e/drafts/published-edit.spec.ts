import { expect, test } from "@playwright/test";
import { draftListFixture } from "../support/draft-list-fixture/draft-list-fixture";
import { setLocalSession } from "../support/local-supabase/local-supabase";

test.describe.configure({ mode: "serial" });
let fixture: ReturnType<typeof draftListFixture>;
test.beforeAll(({}, info) => {
  fixture = draftListFixture(info.project.name, "published");
  fixture.setup();
  fixture.makePublishedReady();
});
test.afterAll(() => fixture?.cleanup());

test("owner and administrator save published changes without changing publication identity", async ({
  browser,
  context,
  page,
}, info) => {
  await setLocalSession(context, fixture.users.author);
  const path = `/dashboard/articles/${fixture.id(20)}`;
  const before = fixture.article(20).article;
  await page.goto("/dashboard");
  const editLink = page.getByRole("link", {
    name: `Edit article: ${fixture.label} own 20`,
  });
  await editLink.focus();
  await expect(editLink).toBeFocused();
  await editLink.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Edit published article" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save article" }),
  ).toBeVisible();
  await expect(page.getByLabel("Image file", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Body image file")).toHaveCount(0);
  await page.getByLabel("Title (required)").fill("Owner published edit");
  await page
    .getByRole("textbox", { name: "Article body" })
    .fill("Owner revised body.");
  await page.getByRole("button", { name: "Save article" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Article saved" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Title (required)")).toHaveValue(
    "Owner published edit",
  );
  const afterOwner = fixture.article(20);
  expect(afterOwner.article).toMatchObject({
    status: "published",
    edit_version: 2,
  });
  expect(afterOwner.article.slug).toBe(before.slug);
  expect(afterOwner.article.published_at).toBe(before.published_at);
  expect(afterOwner.revisions).toBe(1);
  expect(afterOwner.audits).toBe(1);

  const adminContext = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    viewport: page.viewportSize(),
    isMobile: info.project.name === "mobile",
    hasTouch: info.project.name === "mobile",
  });
  try {
    await setLocalSession(adminContext, fixture.users.admin);
    const admin = await adminContext.newPage();
    await admin.goto(path);
    await admin
      .getByLabel("Title (required)")
      .fill("Administrator published edit");
    await admin.getByRole("button", { name: "Save article" }).click();
    await expect(
      admin.getByRole("status").filter({ hasText: "Article saved" }),
    ).toBeVisible();
    expect(fixture.article(20).article).toMatchObject({
      title: "Administrator published edit",
      status: "published",
      edit_version: 3,
      slug: before.slug,
      published_at: before.published_at,
    });
  } finally {
    await adminContext.close();
  }
  await page.getByLabel("Title (required)").fill("Owner stale local edit");
  await page.getByRole("button", { name: "Save article" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "changed elsewhere" }),
  ).toBeVisible();
  await expect(page.getByLabel("Title (required)")).toHaveValue(
    "Owner stale local edit",
  );
  await page
    .getByRole("button", { name: "Review latest saved version" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Latest saved version (3)" }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Load latest saved version" }).click();
  await expect(page.getByLabel("Title (required)")).toHaveValue(
    "Administrator published edit",
  );
  await page.getByLabel("Title (required)").fill("Owner recovered edit");
  await page.getByRole("button", { name: "Save article" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Article saved" }),
  ).toBeVisible();
  expect(fixture.article(20).article).toMatchObject({
    title: "Owner recovered edit",
    status: "published",
    edit_version: 4,
    slug: before.slug,
    published_at: before.published_at,
  });
});

test("archived article remains read only", async ({ context, page }) => {
  await setLocalSession(context, fixture.users.author);
  await page.goto(`/dashboard/articles/${fixture.id(19)}`);
  await expect(page.getByText(/archived/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save article" })).toHaveCount(
    0,
  );
});
