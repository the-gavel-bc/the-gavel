import { expect, test } from "@playwright/test";
import { draftListFixture } from "../support/draft-list-fixture/draft-list-fixture";
import { setLocalSession } from "../support/local-supabase/local-supabase";

test.describe.configure({ mode: "serial" });
let fixture: ReturnType<typeof draftListFixture>;
test.beforeAll(({}, info) => {
  fixture = draftListFixture(info.project.name, "members");
  fixture.setup();
  fixture.seedPendingMember();
});
test.afterAll(() => fixture?.cleanup());

test("administrator lists an email, the person claims it on sign-in, then role change, deactivation and activity", async ({
  browser,
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.admin);
  await page.goto("/dashboard/admin/members");
  const email = fixture.pendingMemberEmail;
  await expect(
    page.getByRole("heading", { name: "Memberships" }),
  ).toBeVisible();
  await page.getByText("Add people", { exact: true }).click();
  await page.getByLabel("BC email addresses").fill(email);
  await page.getByRole("button", { name: "Add to staff list" }).click();
  await expect(page.getByRole("status")).toContainText("Added 1");

  await page.goto("/dashboard/admin/members?state=invited");
  const listed = page.getByRole("listitem").filter({ hasText: email });
  await expect(listed.getByText("Not signed in yet")).toBeVisible();

  // The listed person's first sign-in turns the listing into a membership.
  const personContext = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
  });
  try {
    await setLocalSession(personContext, fixture.pendingMemberUser);
    const personPage = await personContext.newPage();
    await personPage.goto("/dashboard");
    await expect(
      personPage.getByRole("heading", { name: "My articles" }),
    ).toBeVisible();
  } finally {
    await personContext.close();
  }

  await page.goto("/dashboard/admin/members?state=active");
  const member = page.getByRole("listitem").filter({ hasText: email });
  await expect(member.locator('[data-role="author"]')).toBeVisible();
  await member.getByLabel(`Role for ${email}`).selectOption("administrator");
  await member
    .getByRole("button", { name: `Change role for ${email}` })
    .click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "Grant access" }).click();
  await expect(member.locator('[data-role="administrator"]')).toBeVisible();
  await member.getByRole("button", { name: `Deactivate ${email}` }).click();
  await dialog.getByRole("button", { name: "Deactivate", exact: true }).click();
  await expect(member).toHaveCount(0);

  // A person's name opens only that person's activity.
  await page.goto("/dashboard/admin/members?state=inactive");
  await page
    .getByRole("listitem")
    .filter({ hasText: email })
    .getByRole("link")
    .click();
  await expect(
    page.getByRole("heading", { name: `Activity for ${email}` }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: "Deactivated membership" })
      .filter({ hasText: email }),
  ).toBeVisible();
});

test("author cannot view directory; bad cursor offers a reset", async ({
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.author);
  await page.goto("/dashboard/admin/members");
  await expect(page.getByText("Administrator access required.")).toBeVisible();
  await setLocalSession(context, fixture.users.admin);
  await page.goto("/dashboard/admin/members?cursor=bad");
  await expect(page.getByText(/Unable to load memberships/)).toBeVisible();
  await page.getByRole("link", { name: "Reset filter" }).click();
  await expect(
    page.getByRole("heading", { name: "Memberships" }),
  ).toBeVisible();
});
