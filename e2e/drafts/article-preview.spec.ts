import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { draftListFixture } from "../support/draft-list-fixture/draft-list-fixture";
import { setLocalSession } from "../support/local-supabase/local-supabase";

test.describe.configure({ mode: "serial" });
let fixture: ReturnType<typeof draftListFixture>;
test.beforeAll(({}, info) => {
  fixture = draftListFixture(info.project.name, "preview");
  fixture.setup();
  fixture.setupSelections();
  fixture.setPreviewEditor(true);
});
test.afterAll(() => fixture?.cleanup());

test("administrator previews a saved draft with real media and returns to the editor", async ({
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.admin);
  const edit = `/dashboard/articles/${fixture.id(21)}`;
  await page.goto(edit);
  const preview = page.getByRole("link", { name: "Preview article" });
  await expect(preview).toBeVisible();
  await page.getByLabel(/Title/).fill("Saved preview headline");
  await expect(
    page.getByRole("button", { name: "Preview article" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Finish saving your changes and media before previewing."),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Article body" })
    .fill("Saved body text for the preview.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(preview).toBeVisible();
  const png = await sharp({
    create: { width: 12, height: 8, channels: 3, background: "#bd222c" },
  })
    .png()
    .toBuffer();
  const file = { name: "preview.png", mimeType: "image/png", buffer: png };

  await page.getByLabel("Image file", { exact: true }).setInputFiles(file);
  await page.getByLabel("Alt text", { exact: true }).fill("Preview main photo");
  await page.getByLabel("Image credit").fill("Preview photographer");
  await page.getByLabel("Caption", { exact: true }).fill("Main caption.");
  await page.getByRole("button", { name: "Attach image" }).click();
  await expect(page.getByText("Image attached.")).toBeVisible();

  await page.getByLabel("Body image file").setInputFiles(file);
  await expect(page.getByText("Image ready to insert.")).toBeVisible();
  await page.getByLabel("Body image alt text").fill("Preview body photo");
  await page.getByLabel("Body image caption").fill("Body caption.");
  await page.getByRole("button", { name: "Insert body image" }).click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(preview).toBeVisible();

  const before = fixture.article(21);
  await preview.focus();
  await expect(preview).toBeFocused();
  await preview.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Saved preview headline" }),
  ).toBeVisible();
  await expect(page.getByText("Draft preview", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Publication date shown is an estimate."),
  ).toBeVisible();
  await expect(page.getByText("Main caption.", { exact: false })).toBeVisible();
  await expect(page.getByText("Body caption.")).toBeVisible();
  await expect(
    page.getByText("Saved body text for the preview."),
  ).toBeVisible();
  for (const name of ["Preview main photo", "Preview body photo"]) {
    const image = page.getByRole("img", { name });
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth))
      .toBe(12);
    const src = await image.getAttribute("src");
    expect(src).toMatch(/^\/api\/articles\//);
    expect(
      (await context.request.get(src!)).headers()["cache-control"],
    ).toContain("no-store");
    expect(
      (
        await context.request.get(src!.replace(fixture.id(21), fixture.id(22)))
      ).status(),
    ).toBe(404);
  }
  const variants: Record<string, string>[] = [{}, { RSC: "1" }];
  for (const headers of variants) {
    const response = await context.request.get(`${edit}/preview`, { headers });
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("private");
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["content-type"]).toContain(
      headers.RSC ? "text/x-component" : "text/html",
    );
    expect(response.headers()["content-security-policy"]).toContain(
      "script-src",
    );
    expect(response.headers()["x-robots-tag"]).toContain("noindex");
  }
  expect(fixture.article(21)).toEqual(before);
  await page.getByRole("link", { name: "Back to editor" }).click();
  await expect(page).toHaveURL(edit);
  await expect(page.getByLabel(/Title/)).toHaveValue("Saved preview headline");
});

test("editor preview follows review access without exposing the saved draft publicly", async ({
  context,
  page,
  request,
  browser,
}) => {
  const edit = `/dashboard/articles/${fixture.id(21)}`;
  const url = `${edit}/preview`;
  expect((await request.get(url, { maxRedirects: 0 })).status()).toBe(307);
  await setLocalSession(context, fixture.users.author);
  expect((await context.request.get(url)).status()).toBe(404);
  await setLocalSession(context, fixture.users.other);
  expect((await context.request.get(url)).status()).toBe(404);
  fixture.makeInReview(21);
  await page.goto(edit);
  await page.getByRole("link", { name: "Preview article" }).click();
  await expect(
    page.getByRole("heading", { name: "Saved preview headline" }),
  ).toBeVisible();
  const article = fixture.article(21).article;
  expect((await request.get(`/articles/${article.slug}`)).status()).toBe(404);
  const adminContext = await browser.newContext();
  try {
    await setLocalSession(adminContext, fixture.users.admin);
    const admin = await adminContext.newPage();
    await admin.goto(new URL(edit, page.url()).href);
    await admin.getByLabel(/Title/).fill("Newly saved preview headline");
    await admin.getByRole("button", { name: "Save draft" }).click();
    await expect(
      admin.getByRole("link", { name: "Preview article" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Back to editor" }).click();
    await expect(page).toHaveURL(edit);
    await expect(page.getByLabel(/Title/)).toHaveValue(
      "Newly saved preview headline",
    );
    await page.getByRole("link", { name: "Preview article" }).click();
    await expect(
      page.getByRole("heading", { name: "Newly saved preview headline" }),
    ).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(edit);

    await page.getByRole("button", { name: "Return to author" }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog
      .getByLabel("Note to the author")
      .fill("Please verify the captions.");
    await dialog.getByRole("button", { name: "Return to author" }).click();
    await expect(page).toHaveURL(/\/dashboard\/review$/);
    expect((await context.request.get(url)).status()).toBe(404);

    fixture.makeInReview(21);
    fixture.setPreviewEditor(false);
    expect((await context.request.get(url)).status()).toBe(404);

    await admin.goto(new URL(edit, page.url()).href);
    await admin.getByRole("button", { name: "Publish article" }).click();
    await admin
      .getByRole("alertdialog")
      .getByRole("button", { name: "Publish", exact: true })
      .click();
    await expect(
      admin.getByRole("heading", { name: "Edit published article" }),
    ).toBeVisible();
    expect(
      (await adminContext.request.get(new URL(url, page.url()).href)).status(),
    ).toBe(404);
  } finally {
    await adminContext.close();
  }
});

test("preview becomes available after creating a draft with its first photo", async ({
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.admin);
  await page.goto("/dashboard/articles/new");
  await page.getByLabel(/Title/).fill("Preview after first photo");
  await page.getByLabel(/Section/).selectOption(fixture.id(99));
  await expect(
    page.getByRole("checkbox", { name: /Synthetic .* category/ }),
  ).toBeVisible();
  const png = await sharp({
    create: { width: 12, height: 8, channels: 3, background: "#bd222c" },
  })
    .png()
    .toBuffer();
  await page.getByLabel("Image file", { exact: true }).setInputFiles({
    name: "first-photo.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(page).toHaveURL(/\/dashboard\/articles\/[0-9a-f-]+$/);
  await expect(page.getByText("Image ready to attach.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Preview article" }),
  ).toBeDisabled();
  await page
    .getByLabel("Alt text", { exact: true })
    .fill("First preview photo");
  await page.getByLabel("Image credit").fill("Preview photographer");
  await page.getByRole("button", { name: "Attach image" }).click();
  await expect(
    page.getByText(
      "Attached image: First preview photo — Preview photographer",
    ),
  ).toBeVisible();
  await page.getByRole("link", { name: "Preview article" }).click();
  await expect(
    page.getByRole("heading", { name: "Preview after first photo" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "First preview photo" }),
  ).toBeVisible();
});
