import { expect, test } from "@playwright/test";
import { draftListFixture } from "../support/draft-list-fixture/draft-list-fixture";
import { setLocalSession } from "../support/local-supabase/local-supabase";

test.describe.configure({ mode: "serial" });
let fixture: ReturnType<typeof draftListFixture>;
test.beforeAll(({}, info) => {
  fixture = draftListFixture(info.project.name, "admin");
  fixture.setup();
  fixture.makeArchivedReady();
});
test.afterAll(() => fixture?.cleanup());

test("administrator filters all articles and restores a ready archive", async ({
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.admin);
  const before = fixture.article(19).article;
  await page.goto("/dashboard/admin/articles");
  await expect(
    page.getByRole("heading", { name: "Article management" }),
  ).toBeVisible();
  await page.getByLabel("Search article titles").fill("other private");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(
    page.getByRole("link", {
      name: `Manage article: ${fixture.label} other private`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("Archived story body.")).toHaveCount(0);
  await page.goto("/dashboard/admin/articles");
  const firstTitle = await page
    .getByRole("link", { name: /Manage article:/ })
    .first()
    .textContent();
  await page.getByRole("link", { name: "Next page" }).click();
  await expect(page).toHaveURL(/cursor=/);
  await expect(
    page.getByRole("link", { name: firstTitle ?? "", exact: true }),
  ).toHaveCount(0);
  await page.goto("/dashboard/admin/articles");
  await page.getByRole("link", { name: "View archives" }).click();
  await expect(page.getByLabel("Status")).toHaveValue("archived");
  await page.getByLabel("Search article titles").fill("own 19");
  await page.getByRole("button", { name: "Apply filters" }).click();
  const manage = page.getByRole("link", {
    name: `Manage article: ${fixture.label} own 19`,
  });
  await manage.focus();
  await expect(manage).toBeFocused();
  await manage.press("Enter");
  await expect(
    page.getByRole("button", { name: "Restore article" }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Restore article" }).click();
  expect(fixture.article(19).article.status).toBe("archived");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Restore article" }).click();
  await expect(page.getByRole("link", { name: "Edit article" })).toBeVisible();
  expect(fixture.article(19)).toMatchObject({
    article: {
      status: "published",
      edit_version: 2,
      published_at: before.published_at,
      archived_at: null,
      slug: before.slug,
    },
    revisions: 1,
    audits: 1,
    receipts: 1,
  });
});

test("author cannot read admin list or detail; My Articles stays owner-filtered", async ({
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.author);
  await page.goto("/dashboard/admin/articles");
  await expect(page.getByText("Administrator access required.")).toBeVisible();
  await page.goto(`/dashboard/admin/articles/${fixture.id(22)}`);
  await expect(page.getByText("Administrator access required.")).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByText(`${fixture.label} other private`)).toHaveCount(0);
});

test("bad cursor has a safe recovery; inactive administrator loses access", async ({
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.admin);
  await page.goto("/dashboard/admin/articles?cursor=bad");
  await expect(
    page.getByText(/Unable to load articles\. Check the filters/),
  ).toBeVisible();
  await page.getByRole("link", { name: "Reset filters" }).click();
  await expect(
    page.getByRole("heading", { name: "Article management" }),
  ).toBeVisible();
  fixture.setAdminAccess(false);
  await page.goto("/dashboard/admin/articles");
  await expect(page).toHaveURL(/access-pending/);
  fixture.setAdminAccess(true);
});
