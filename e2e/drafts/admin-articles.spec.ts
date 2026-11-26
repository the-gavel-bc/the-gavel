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
    page.getByRole("heading", {
      name: `${fixture.label} other private`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("Archived story body.")).toHaveCount(0);
  await page.goto("/dashboard/admin/articles");
  const firstTitle = await page
    .getByRole("listitem")
    .getByRole("heading")
    .first()
    .textContent();
  await page.getByRole("link", { name: "Next page" }).click();
  await expect(page).toHaveURL(/cursor=/);
  await expect(
    page.getByRole("heading", { name: firstTitle ?? "", exact: true }),
  ).toHaveCount(0);
  await page.goto("/dashboard/admin/articles");
  await page.getByRole("link", { name: "View archives" }).click();
  await expect(page.getByLabel("Status")).toHaveValue("archived");
  // The same control now returns to the view we came from.
  await expect(
    page.getByRole("link", { name: "Back to all articles" }),
  ).toBeVisible();
  await page.getByLabel("Search article titles").fill("own 19");
  await page.getByRole("button", { name: "Apply filters" }).click();
  const restore = page.getByRole("button", {
    name: `Restore article: ${fixture.label} own 19`,
  });
  await restore.focus();
  await expect(restore).toBeFocused();
  await restore.press("Enter");
  // Cancelling the in-page confirmation changes nothing.
  await page.getByRole("button", { name: "Cancel" }).click();
  expect(fixture.article(19).article.status).toBe("archived");
  await restore.click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(restore).toHaveCount(0);
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
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).not.toHaveURL(/cursor=/);
  await expect(
    page.getByRole("heading", { name: "Article management" }),
  ).toBeVisible();
  fixture.setAdminAccess(false);
  await page.goto("/dashboard/admin/articles");
  await expect(page).toHaveURL(/access-pending/);
  fixture.setAdminAccess(true);
});

test("dashboard filters keep keyboard focus visible and touch targets usable", async ({
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.admin);
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/dashboard/admin/articles");
  const apply = page.getByRole("button", { name: "Apply filters" });
  await page.keyboard.press("Tab");
  await apply.focus();
  await expect(apply).toBeFocused();
  await expect(apply).toHaveCSS("outline-style", "solid");
  if (await page.evaluate(() => matchMedia("(pointer: coarse)").matches)) {
    const target = await apply.boundingBox();
    expect(target?.height).toBeGreaterThanOrEqual(44);
    expect(target?.width).toBeGreaterThanOrEqual(44);
  }
});

test("back arrow returns to the filtered list it came from", async ({
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.admin);
  await page.goto("/dashboard/admin/articles");
  await page.getByLabel("Search article titles").fill("admin own");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/search=admin\+own/);
  await page
    .getByRole("link", { name: `Edit draft: ${fixture.label} admin own` })
    .click();
  await expect(page.getByRole("heading", { name: "Edit draft" })).toBeVisible();
  await page.getByRole("link", { name: "Back to Administration" }).click();
  await expect(page).toHaveURL(/search=admin\+own/);
  await expect(page.getByLabel("Search article titles")).toHaveValue(
    "admin own",
  );
  // Top-level pages have no back arrow; the sidebar covers them.
  await expect(page.getByRole("link", { name: /^Back to / })).toHaveCount(0);
});
