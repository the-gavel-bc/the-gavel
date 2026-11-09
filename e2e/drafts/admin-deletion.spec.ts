import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { draftListFixture } from "../support/draft-list-fixture/draft-list-fixture";
import {
  localSupabase,
  setLocalSession,
} from "../support/local-supabase/local-supabase";
test.describe.configure({ mode: "serial" });
let fixture: ReturnType<typeof draftListFixture>;
test.beforeAll(({}, info) => {
  fixture = draftListFixture(info.project.name, "deletion");
  fixture.setup();
});
test.afterAll(async () => {
  if (!fixture) return;
  const local = localSupabase();
  const client = createClient(local.API_URL, local.SERVICE_ROLE_KEY);
  await client.storage
    .from("article-media")
    .remove([
      `${fixture.id(19)}/${fixture.id(91)}.webp`,
      `${fixture.id(19)}/${fixture.id(93)}.webp`,
    ]);
  fixture.cleanup();
});
test("administrator confirms deletion of an archived article", async ({
  context,
  page,
}, info) => {
  test.skip(
    info.project.name === "mobile",
    "Cleanup health is shared across browser projects.",
  );
  await setLocalSession(context, fixture.users.admin);
  fixture.prepareDeletionMedia();
  await page.goto("/dashboard/admin/media-cleanup");
  await page.getByRole("button", { name: "Run cleanup check" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Cleanup check completed",
  );
  await page.goto(`/dashboard/admin/articles/${fixture.id(19)}`);
  const button = page.getByRole("button", {
    name: "Permanently delete article",
  });
  await expect(button).toBeDisabled();
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await button.click();
  await expect(page).toHaveURL(/\/dashboard\/admin\/articles\?deleted=1$/);
  await expect(page.getByRole("status")).toContainText(
    "Image cleanup continues",
  );
  const local = localSupabase();
  const client = createClient(local.API_URL, local.SERVICE_ROLE_KEY);
  const bucket = client.storage.from("article-media");
  const key = `${fixture.id(19)}/${fixture.id(91)}.webp`;
  const upload = await bucket.upload(
    key,
    Buffer.from("late synthetic upload"),
    { contentType: "image/webp" },
  );
  expect(upload.error).toBeNull();
  const unknownKey = `${fixture.id(19)}/${fixture.id(93)}.webp`;
  const unknownUpload = await bucket.upload(
    unknownKey,
    Buffer.from("late untracked upload"),
    { contentType: "image/webp" },
  );
  expect(unknownUpload.error).toBeNull();
  await page.goto("/dashboard/admin/media-cleanup");
  await page.getByRole("button", { name: "Run cleanup check" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Cleanup check completed",
  );
  const removed = await bucket.download(key);
  expect(removed.error).not.toBeNull();
  expect((await bucket.download(unknownKey)).error).not.toBeNull();
  await page.goto("/dashboard/admin/audit?action=article.deleted");
  await expect(
    page.getByText(`Deleted article ${fixture.id(19)}`),
  ).toBeVisible();
});
test("author cannot open the administrator deletion controls", async ({
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.author);
  await page.goto(`/dashboard/admin/articles/${fixture.id(20)}`);
  await expect(page.getByText("Administrator access required.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Permanently delete article" }),
  ).toHaveCount(0);
});
