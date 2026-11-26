import { expect, test } from "@playwright/test";
import sharp from "sharp";
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

test("administrator tabs resolve conflicting published edits without changing publication identity", async ({
  browser,
  context,
  page,
}, info) => {
  await setLocalSession(context, fixture.users.author);
  const path = `/dashboard/articles/${fixture.id(20)}`;
  const before = fixture.article(20).article;
  await page.goto(path);
  await expect(page.getByRole("button", { name: "Save article" })).toHaveCount(
    0,
  );
  await setLocalSession(context, fixture.users.admin);
  await page.goto(path);
  await expect(
    page.getByRole("heading", { name: "Edit published article" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save article" }),
  ).toBeVisible();
  await expect(page.getByLabel("Image file", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Body image file")).toHaveCount(0);
  await page.getByLabel("Title (required)").fill("First published edit");
  await page
    .getByRole("textbox", { name: "Article body" })
    .fill("First revised body.");
  await page.getByRole("button", { name: "Save article" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Article saved" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Title (required)")).toHaveValue(
    "First published edit",
  );
  const afterFirstSave = fixture.article(20);
  expect(afterFirstSave.article).toMatchObject({
    status: "published",
    edit_version: 2,
  });
  expect(afterFirstSave.article.slug).toBe(before.slug);
  expect(afterFirstSave.article.published_at).toBe(before.published_at);
  expect(afterFirstSave.revisions).toBe(1);
  expect(afterFirstSave.audits).toBe(1);

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
  await page.getByLabel("Title (required)").fill("Stale published edit");
  await page.getByRole("button", { name: "Save article" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "changed elsewhere" }),
  ).toBeVisible();
  await expect(page.getByLabel("Title (required)")).toHaveValue(
    "Stale published edit",
  );
  await page
    .getByRole("button", { name: "Review latest saved version" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Latest saved version (3)" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Load latest saved version" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Load saved version" })
    .click();
  await expect(page.getByLabel("Title (required)")).toHaveValue(
    "Administrator published edit",
  );
  await page.getByLabel("Title (required)").fill("Recovered published edit");
  await page.getByRole("button", { name: "Save article" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Article saved" }),
  ).toBeVisible();
  expect(fixture.article(20).article).toMatchObject({
    title: "Recovered published edit",
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

test("published photo stays private until attached and replacement updates public rendering", async ({
  context,
  page,
  browser,
}) => {
  await setLocalSession(context, fixture.users.admin);
  const articleId = fixture.id(20);
  await page.goto(`/dashboard/articles/${articleId}`);
  const publicContext = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
  });
  try {
    const reader = await publicContext.newPage();
    const slug = fixture.article(20).article.slug;
    for (const [color, alt, caption] of [
      ["#bd222c", "Published baseline photo", "Baseline caption"],
      ["#2244cc", "Published replacement photo", "Replacement caption"],
    ]) {
      const response = page.waitForResponse(
        (result) =>
          result.request().method() === "POST" &&
          result.url().includes(`/api/articles/${articleId}/media/`),
      );
      await page.getByLabel("Image file", { exact: true }).setInputFiles({
        name: "published-photo.png",
        mimeType: "image/png",
        buffer: await sharp({
          create: { width: 12, height: 8, channels: 3, background: color },
        })
          .png()
          .toBuffer(),
      });
      const assetId = (await response).url().split("/").at(-1);
      await expect(
        page.getByText("Image ready to attach.", { exact: true }),
      ).toBeVisible();
      expect(
        (
          await publicContext.request.get(
            `/api/public/articles/${articleId}/media/${assetId}`,
          )
        ).status(),
      ).toBe(404);
      await page.getByLabel("Alt text", { exact: true }).fill(alt);
      await page.getByLabel("Image credit", { exact: true }).fill("The Gavel");
      await page.getByLabel("Caption", { exact: true }).fill(caption);
      await page
        .getByRole("button", { name: "Attach image", exact: true })
        .click();
      await expect(
        page.getByText("Image attached.", { exact: true }),
      ).toBeVisible();
      await reader.goto(`/articles/${slug}`);
      const image = reader.getByRole("img", { name: alt, exact: true });
      await expect(image).toBeVisible();
      await expect
        .poll(() =>
          image.evaluate(
            (element) => (element as HTMLImageElement).naturalWidth,
          ),
        )
        .toBeGreaterThan(0);
      await expect(reader.locator("figcaption")).toHaveText(
        `${caption} Photo: The Gavel`,
      );
    }
  } finally {
    await publicContext.close();
  }
});

test("phones load a resized published photo; unpublished variants stay private", async ({
  context,
  page,
  browser,
}) => {
  await setLocalSession(context, fixture.users.admin);
  const articleId = fixture.id(20);
  await page.goto(`/dashboard/articles/${articleId}`);
  const reader = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    viewport: { width: 375, height: 800 },
    deviceScaleFactor: 2,
  });
  try {
    const response = page.waitForResponse(
      (result) =>
        result.request().method() === "POST" &&
        result.url().includes(`/api/articles/${articleId}/media/`),
    );
    await page.getByLabel("Image file", { exact: true }).setInputFiles({
      name: "wide-photo.png",
      mimeType: "image/png",
      buffer: await sharp({
        create: {
          width: 2000,
          height: 1000,
          channels: 3,
          background: "#228844",
        },
      })
        .png()
        .toBuffer(),
    });
    const assetId = (await response).url().split("/").at(-1);
    await expect(
      page.getByText("Image ready to attach.", { exact: true }),
    ).toBeVisible();
    const variant = `/api/public/articles/${articleId}/media/${assetId}?w=480`;
    // Resizing never bypasses publication: an unattached upload stays private.
    expect((await reader.request.get(variant)).status()).toBe(404);
    await page.getByLabel("Alt text", { exact: true }).fill("Wide photo");
    await page.getByLabel("Image credit", { exact: true }).fill("The Gavel");
    await page
      .getByRole("button", { name: "Attach image", exact: true })
      .click();
    await expect(
      page.getByText("Image attached.", { exact: true }),
    ).toBeVisible();

    const ok = await reader.request.get(variant);
    expect(ok.status()).toBe(200);
    expect(ok.headers()["cache-control"]).toContain("max-age=300");
    expect((await sharp(await ok.body()).metadata()).width).toBe(480);
    expect(
      (
        await reader.request.get(
          `/api/public/articles/${articleId}/media/${assetId}?w=123`,
        )
      ).status(),
    ).toBe(404);

    const tab = await reader.newPage();
    await tab.goto(`/articles/${fixture.article(20).article.slug}`);
    const image = tab.getByRole("img", { name: "Wide photo", exact: true });
    await expect(image).toBeVisible();
    // About 300 CSS px at 2x density: the 960 px variant, not the original.
    await expect
      .poll(() =>
        image.evaluate((element) => (element as HTMLImageElement).currentSrc),
      )
      .toContain("?w=960");
  } finally {
    await reader.close();
  }
});
