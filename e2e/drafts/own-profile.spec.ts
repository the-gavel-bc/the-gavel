import { expect, test } from "@playwright/test";
import { draftListFixture } from "../support/draft-list-fixture/draft-list-fixture";
import { setLocalSession } from "../support/local-supabase/local-supabase";

test.describe.configure({ mode: "serial" });
let fixture: ReturnType<typeof draftListFixture>;
test.beforeAll(({}, info) => {
  fixture = draftListFixture(info.project.name, "profile");
  fixture.setup();
});
test.afterAll(() => fixture?.cleanup());

test("member edits their own profile and generated slug persists", async ({
  context,
  page,
}, info) => {
  await setLocalSession(context, fixture.users.empty);
  await page.goto("/dashboard/profile");
  await expect(
    page.getByRole("heading", { name: "My public profile" }),
  ).toBeVisible();
  await expect(page.getByLabel("Slug")).toHaveCount(0);
  const name = `Profile Writer ${info.project.name}`;
  await page.getByLabel("Public display name").fill(name);
  await page.getByLabel("Public biography").fill("A public biography.");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await expect(
    page.getByText(`Author URL: /authors/profile-writer-${info.project.name}`),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Public display name")).toHaveValue(name);
  await expect(page.getByLabel("Public biography")).toHaveValue(
    "A public biography.",
  );
});
test("published author slug stays fixed; signed-out users are redirected", async ({
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.author);
  await page.goto("/dashboard/profile");
  const url = await page.getByText(/^Author URL:/).textContent();
  await expect(
    page.getByText("Your author URL is fixed after publication."),
  ).toBeVisible();
  await page.getByLabel("Public display name").fill("Published Profile Writer");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await expect(page.getByText(url ?? "missing", { exact: true })).toBeVisible();
  await context.clearCookies();
  await page.goto("/dashboard/profile");
  await expect(page).toHaveURL(/sign-in/);
});
