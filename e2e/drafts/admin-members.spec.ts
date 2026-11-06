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

test("administrator approves, changes role, deactivates, and reads activity", async ({
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.admin);
  await page.goto("/dashboard/admin/members?state=pending");
  const email = fixture.pendingMemberEmail;
  await expect(
    page.getByRole("heading", { name: "Memberships" }),
  ).toBeVisible();
  await page
    .getByLabel(`Public display name for ${email}`)
    .fill("New Gavel Writer");
  await page.getByRole("button", { name: `Approve ${email}` }).click();
  await expect(page.getByRole("heading", { name: email })).toHaveCount(0);

  await page.goto("/dashboard/admin/members?state=active");
  const member = page.getByRole("listitem").filter({ hasText: email });
  await expect(member.getByText("Public name: New Gavel Writer")).toBeVisible();
  await member.getByLabel(`Role for ${email}`).selectOption("administrator");
  await member
    .getByRole("button", { name: `Change role for ${email}` })
    .click();
  await expect(member.getByText("Role: administrator")).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept());
  await member.getByRole("button", { name: `Deactivate ${email}` }).click();
  await expect(member).toHaveCount(0);

  await page.getByRole("link", { name: "Membership activity" }).click();
  await expect(
    page.getByText(`Deactivated membership for ${email}`),
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
