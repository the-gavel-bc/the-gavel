import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { draftListFixture } from "../support/draft-list-fixture/draft-list-fixture";
import { setLocalSession } from "../support/local-supabase/local-supabase";

test.describe.configure({ mode: "serial" });
let fixture: ReturnType<typeof draftListFixture>;
test.beforeAll(({}, info) => {
  fixture = draftListFixture(info.project.name, "media");
  fixture.setup();
});
test.afterAll(() => fixture?.cleanup());

test("owner uploads, describes, attaches and unlinks a private main image", async ({
  context,
  page,
}, info) => {
  await setLocalSession(context, fixture.users.author);
  await page.goto(`/dashboard/articles/${fixture.id(21)}`);
  await page.getByLabel("Image file", { exact: true }).setInputFiles({
    name: "invalid.png",
    mimeType: "image/png",
    buffer: Buffer.from("not a PNG"),
  });
  await page.getByRole("button", { name: "Upload image" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Choose a valid JPEG" }),
  ).toBeVisible();
  const png = await sharp({
    create: { width: 12, height: 8, channels: 3, background: "#bd222c" },
  })
    .png()
    .toBuffer();
  await page.getByLabel("Image file", { exact: true }).setInputFiles({
    name: "synthetic.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page.getByRole("button", { name: "Upload image" }).click();
  await expect(page.getByText("Image ready to attach.")).toBeVisible();
  await page
    .getByLabel("Alt text", { exact: true })
    .fill("Red newsroom graphic");
  await page.getByLabel("Image credit").fill("The Gavel");
  await page.getByRole("button", { name: "Attach image" }).click();
  await expect(page.getByText("Image attached.")).toBeVisible();
  await expect(
    page.getByText("Attached image: Red newsroom graphic — The Gavel"),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("article-media.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByText("Attached image: Red newsroom graphic — The Gavel"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remove image" }).click();
  await expect(page.getByText("Image removed.")).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Attached image: Red newsroom graphic — The Gavel"),
  ).toHaveCount(0);
});
