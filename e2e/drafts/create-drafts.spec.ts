import { expect, test } from "@playwright/test";
import { draftListFixture } from "../support/draft-list-fixture/draft-list-fixture";
import { setLocalSession } from "../support/local-supabase/local-supabase";
import { expectVisibleFocus } from "../support/focus/focus";
test.describe.configure({ mode: "serial" });
let fixture: ReturnType<typeof draftListFixture>;
let transport: { actionId: string; body: string };
test.beforeAll(({}, info) => {
  fixture = draftListFixture(info.project.name, "create");
  fixture.setup();
});
test.afterAll(() => fixture?.cleanup());
async function fill(page: import("@playwright/test").Page, slug: string) {
  await page.getByLabel(/Title/).fill(`${fixture.label} created draft`);
  await page.getByLabel(/Slug/).fill(slug);
  await page.getByLabel(/Section/).selectOption(fixture.id(99));
}
test("creates a private draft and opens it for editing", async ({
  context,
  page,
}, info) => {
  await setLocalSession(context, fixture.users.empty);
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Create draft" }).click();
  await expect(page.getByRole("heading", { name: "New draft" })).toBeVisible();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Review the highlighted" }),
  ).toBeFocused();
  const slug = `task7-${info.project.name}-created`;
  await fill(page, slug);
  await expect(
    page.getByRole("textbox", { name: "Article body" }),
  ).toBeVisible();
  await page.getByLabel(/Section/).focus();
  for (let step = 0; step < 20; step++) {
    await page.keyboard.press("Tab");
    if (
      await page
        .getByRole("button", { name: "Create draft" })
        .evaluate((element) => element === document.activeElement)
    )
      break;
  }
  await expectVisibleFocus(page.getByRole("button", { name: "Create draft" }));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("create-draft.png"),
    fullPage: true,
  });
  page.on("request", (request) => {
    const actionId = request.headers()["next-action"];
    if (request.method() === "POST" && actionId)
      transport = { actionId, body: request.postData()! };
  });
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/dashboard\/articles\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: "Edit draft" })).toBeVisible();
  await page.getByRole("link", { name: "Back to My articles" }).click();
  await expect(
    page.getByRole("heading", {
      name: `${fixture.label} created draft`,
      exact: true,
    }),
  ).toBeVisible();
  expect(fixture.created(slug)).toEqual({
    status: "draft",
    excerpt: null,
    content: null,
    seoKeyphrase: null,
    metaDescription: null,
    version: 1,
    revisions: 1,
    audits: 1,
    receipts: 1,
  });
});
test("rejects malformed action encoding and forged ownership without creating rows", async ({
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.empty);
  const before = fixture.createdCount();
  const headers = {
    "Next-Action": transport.actionId,
    "Content-Type": "text/plain;charset=UTF-8",
    Origin: "http://127.0.0.1:3100",
  };
  const malformed = await page.request.post("/dashboard/articles/new", {
    headers,
    data: "[",
  });
  expect(malformed.status()).toBeGreaterThanOrEqual(400);
  const args: unknown = JSON.parse(transport.body);
  if (!Array.isArray(args) || typeof args[0] !== "object" || !args[0])
    throw new Error("Unexpected action fixture encoding.");
  const forged = await page.request.post("/dashboard/articles/new", {
    headers,
    data: JSON.stringify([{ ...args[0], ownerProfileId: fixture.id(99) }]),
  });
  expect(await forged.text()).toContain("invalid_input");
  expect(fixture.createdCount()).toBe(before);
});
test("keeps a global slug collision visible without renaming or losing input", async ({
  context,
  page,
}, info) => {
  await setLocalSession(context, fixture.users.empty);
  await page.goto("/dashboard/articles/new");
  await fill(page, `task7-${info.project.name}-other`);
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "already in use" }),
  ).toContainText("already in use");
  await expect(page.getByLabel(/Slug/)).toHaveValue(
    `task7-${info.project.name}-other`,
  );
  await expect(page.getByLabel(/Title/)).toHaveValue(
    `${fixture.label} created draft`,
  );
});
test("lost action response retries the same command and creates one history set", async ({
  context,
  page,
}, info) => {
  await setLocalSession(context, fixture.users.empty);
  await page.goto("/dashboard/articles/new");
  const slug = `task7-${info.project.name}-retried`;
  await fill(page, slug);
  await page.getByLabel(/Excerpt/).fill("A synthetic summary.");
  await page.getByLabel(/SEO keyphrase/).fill("Synthetic phrase");
  await page.getByLabel(/Meta description/).fill("Synthetic description.");
  const bodies: string[] = [];
  let first = true;
  await page.route("**/dashboard/articles/new", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    bodies.push(route.request().postData()!);
    if (first) {
      first = false;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(
    page.getByRole("button", { name: "Retry same request" }),
  ).toBeVisible();
  await expect(page.getByLabel(/Title/)).toBeDisabled();
  fixture.setCreateAccess(false);
  await page.getByRole("button", { name: "Retry same request" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Your access" }),
  ).toBeVisible();
  await expect(page.getByLabel(/Title/)).toBeDisabled();
  fixture.setCreateAccess(true);
  await page.getByRole("button", { name: "Retry same request" }).click();
  await expect(page).toHaveURL(/\/dashboard\/articles\/[0-9a-f-]+$/);
  expect(bodies).toHaveLength(3);
  expect(bodies[1]).toBe(bodies[0]);
  expect(bodies[2]).toBe(bodies[0]);
  expect(fixture.created(slug)).toMatchObject({
    version: 1,
    revisions: 1,
    audits: 1,
    receipts: 1,
    excerpt: "A synthetic summary.",
    seoKeyphrase: "Synthetic phrase",
    metaDescription: "Synthetic description.",
  });
});
test("direct create navigation denies a signed-out reader", async ({
  page,
}) => {
  await page.goto("/dashboard/articles/new");
  await expect(page).toHaveURL(/\/sign-in$/);
});
test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  test("shows an explanation and leaves submission disabled", async ({
    context,
    page,
  }) => {
    await setLocalSession(context, fixture.users.empty);
    await page.goto("/dashboard/articles/new");
    await expect(
      page.getByText(/Enable JavaScript to create or save a draft/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create draft" }),
    ).toBeDisabled();
  });
});
