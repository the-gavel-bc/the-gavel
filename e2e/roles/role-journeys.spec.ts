import { expect, test, type Page } from "@playwright/test";
import { setLocalSession } from "../support/local-supabase/local-supabase";
import { roleFixture } from "../support/role-fixture/role-fixture";

// One journey per role over the same articles: what each role can see and do,
// and what it is refused. The database rules are proven by pgTAP; these check
// that the dashboard offers exactly the matching controls and that they work.
test.describe.configure({ mode: "serial" });
let fixture: ReturnType<typeof roleFixture>;
test.beforeAll(({}, info) => {
  fixture = roleFixture(info.project.name);
  fixture.setup();
});
test.afterAll(() => fixture?.cleanup());

const adminPages = [
  ["/dashboard/admin/articles", "Article management"],
  ["/dashboard/admin/audit", "Article activity"],
  ["/dashboard/admin/homepage", "Homepage"],
  ["/dashboard/admin/media-cleanup", "Media cleanup"],
  ["/dashboard/admin/members", "Memberships"],
  ["/dashboard/admin/site", "Site information"],
  ["/dashboard/admin/taxonomy", "Taxonomy"],
] as const;

async function confirm(page: Page, label: string) {
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: label, exact: true })
    .click();
}

test("author: own saves show at once on client revisits; sign-out drops cached pages", async ({
  context,
  page,
}) => {
  // next.config.ts reuses dynamic pages for 30 s on client navigation. A
  // member's own saves must still show immediately, and signing out must not
  // leave dashboard pages reachable with Back. The excerpt is used because a
  // title change would also change the slug that later journeys rely on.
  await setLocalSession(context, fixture.users.author);
  const name = fixture.title(fixture.articles.draft);
  await page.goto("/dashboard");
  // Visit the editor once so a client copy of it exists, then come back.
  await page.getByRole("link", { name }).click();
  const excerpt = page.getByLabel("Excerpt (optional)");
  await expect(excerpt).toBeVisible();
  const original = await excerpt.inputValue();
  await excerpt.fill("Revised excerpt for the cache check.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Draft saved." }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Back to My articles" }).click();
  await page.getByRole("link", { name }).click();
  await expect(excerpt).toHaveValue("Revised excerpt for the cache check.");

  await excerpt.fill(original);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Draft saved." }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goBack();
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(excerpt).toHaveCount(0);
});

test("author: writes and submits own drafts, never publishes, corrects or administers", async ({
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.author);
  await page.goto("/dashboard");
  await expect(
    page.getByRole("link", { name: fixture.title(fixture.articles.draft) }),
  ).toBeVisible();

  await page.goto(`/dashboard/articles/${fixture.id(fixture.articles.draft)}`);
  await expect(page.getByRole("heading", { name: "Edit draft" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Publish article" }),
  ).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Correction" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Submit for review" }).click();
  await confirm(page, "Submit for review");
  await expect
    .poll(() => fixture.article(fixture.articles.draft)?.review_requested_at)
    .not.toBeNull();

  // Once submitted it is read-only for the author.
  await page.goto(`/dashboard/articles/${fixture.id(fixture.articles.draft)}`);
  await expect(page.getByText(/This article is in review/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Save/ })).toHaveCount(0);

  // Someone else's article does not exist for an author.
  const other = await page.goto(
    `/dashboard/articles/${fixture.id(fixture.articles.published)}`,
  );
  expect(other?.status()).toBe(404);

  await page.goto("/dashboard/review");
  await expect(page.getByRole("heading", { name: "Review queue" })).toHaveCount(
    0,
  );
  for (const [path] of adminPages) {
    await page.goto(path);
    await expect(
      page.getByText("Administrator access required."),
    ).toBeVisible();
  }
});

test("editor: reviews, returns, publishes and corrects own publications only", async ({
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.editor);
  await page.goto("/dashboard/review");
  await expect(
    page.getByRole("heading", { name: "Review queue" }),
  ).toBeVisible();
  await expect(
    page.getByText(fixture.title(fixture.articles.draft), { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(fixture.title(fixture.articles.inReview), { exact: true }),
  ).toBeVisible();

  // Return one submission with a note.
  await page.goto(
    `/dashboard/articles/${fixture.id(fixture.articles.inReview)}`,
  );
  await page.getByRole("button", { name: "Return to author" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("textbox", { name: "Note to the author" })
    .fill("Please add a source.");
  await confirm(page, "Return to author");
  await expect
    .poll(() => fixture.article(fixture.articles.inReview)?.review_note)
    .toBe("Please add a source.");
  expect(
    fixture.article(fixture.articles.inReview)?.review_requested_at,
  ).toBeNull();

  // Publish the other submission.
  await page.goto(`/dashboard/articles/${fixture.id(fixture.articles.draft)}`);
  await page.getByRole("button", { name: "Publish article" }).click();
  await confirm(page, "Publish");
  await expect
    .poll(() => fixture.article(fixture.articles.draft)?.status)
    .toBe("published");
  expect(fixture.article(fixture.articles.draft)?.published_by_profile_id).toBe(
    `00000000-0000-0000-0000-${String(fixture.users.editor).padStart(12, "0")}`,
  );

  // Their own publication: archive and correction are offered, editing is not.
  await page.goto(`/dashboard/articles/${fixture.id(fixture.articles.draft)}`);
  await expect(
    page.getByRole("button", { name: "Archive article" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: /Optional\. Shown at the end/ })
    .fill("An earlier version misspelled a name.");
  await page.getByRole("button", { name: "Add correction" }).click();
  await expect(page.getByText("Correction saved.")).toBeVisible();
  expect(fixture.article(fixture.articles.draft)?.correction).toBe(
    "An earlier version misspelled a name.",
  );
  await page.goto(`/articles/${fixture.slug(fixture.articles.draft)}`);
  await expect(
    page.getByRole("complementary", { name: "Correction" }),
  ).toContainText("misspelled a name");
  await expect(page.getByText(/Updated/)).toBeVisible();

  // Published by someone else: nothing to change.
  await page.goto(
    `/dashboard/articles/${fixture.id(fixture.articles.published)}`,
  );
  await expect(
    page.getByRole("button", { name: "Archive article" }),
  ).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Correction" })).toHaveCount(
    0,
  );

  for (const [path] of adminPages) {
    await page.goto(path);
    await expect(
      page.getByText("Administrator access required."),
    ).toBeVisible();
  }
});

test("administrator: every admin page, edits and corrects any article, archives and restores", async ({
  context,
  page,
}) => {
  await setLocalSession(context, fixture.users.admin);
  for (const [path, heading] of adminPages) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { level: 1, name: heading }),
    ).toBeVisible();
  }
  await page.goto("/dashboard/review");
  await expect(
    page.getByRole("heading", { name: "Review queue" }),
  ).toBeVisible();

  const id = fixture.id(fixture.articles.published);
  await page.goto(`/dashboard/articles/${id}`);
  await expect(
    page.getByRole("heading", { name: "Edit published article" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: /Optional\. Shown at the end/ })
    .fill("Corrected by the desk.");
  await page.getByRole("button", { name: "Add correction" }).click();
  await expect(page.getByText("Correction saved.")).toBeVisible();

  await page.getByRole("button", { name: "Archive article" }).click();
  await confirm(page, "Archive");
  await expect
    .poll(() => fixture.article(fixture.articles.published)?.status)
    .toBe("archived");

  await page.goto(`/dashboard/admin/articles/${id}`);
  await page.getByRole("button", { name: "Restore article" }).click();
  await confirm(page, "Restore");
  await expect
    .poll(() => fixture.article(fixture.articles.published)?.status)
    .toBe("published");
});
