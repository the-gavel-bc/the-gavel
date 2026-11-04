import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { draftListFixture } from "../support/draft-list-fixture/draft-list-fixture";
import { setLocalSession } from "../support/local-supabase/local-supabase";

test.describe.configure({ mode: "serial" });
let fixture: ReturnType<typeof draftListFixture>;
test.beforeAll(({}, info) => {
  fixture = draftListFixture(info.project.name, "bodyMedia");
  fixture.setup();
});
test.afterAll(() => fixture?.cleanup());

test("owner inserts and reopens an accessible private body image", async ({
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.author);
  await page.goto(`/dashboard/articles/${fixture.id(21)}`);
  const png = await sharp({
    create: { width: 12, height: 8, channels: 3, background: "#bd222c" },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel("Body image file")
    .setInputFiles({
      name: "synthetic.png",
      mimeType: "image/png",
      buffer: png,
    });
  await page.getByRole("button", { name: "Upload body image" }).click();
  await expect(page.getByText("Image ready to insert.")).toBeVisible();
  await page.getByLabel("Body image alt text").fill("Red newsroom graphic");
  await page.getByLabel("Body image caption").fill("On campus");
  await page.getByRole("button", { name: "Insert body image" }).click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Draft saved" }),
  ).toBeVisible();
  await page.reload();
  const image = page.getByRole("img", { name: "Red newsroom graphic" });
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute(
    "src",
    /\/api\/articles\/[^/]+\/media\/[^/]+/,
  );
  await expect(page.getByText("On campus")).toBeVisible();
});
