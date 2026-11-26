import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { requireActiveMembership } from "@/backend/auth/access/access";
import { getHomepageImageUrls } from "@/backend/homepage/homepage-curation/homepage-images";
import { listHomepageStoriesAction } from "@/backend/homepage/homepage-curation/homepage-stories-action";
import {
  getAdminHomepageCuration,
  type HomepageArticle,
} from "@/backend/homepage/homepage-curation/homepage-curation";
import { HomepageEditor } from "@/frontend/features/homepage/components/admin-homepage/homepage-editor";

export const metadata = { title: "Homepage curation" };

export default async function AdminHomepagePage() {
  const access = await requireActiveMembership();
  if (access.role !== "administrator")
    return (
      <>
        <h1>Homepage</h1>
        <p role="alert">Administrator access required.</p>
        <Link href="/dashboard">My articles</Link>
      </>
    );
  let curation, library, images;
  try {
    [curation, library] = await Promise.all([
      getAdminHomepageCuration(),
      listHomepageStoriesAction({}),
    ]);
    if (!library.ok) throw new Error("Unable to load stories.");
    const { saved, effective } = curation;
    // Effective stories are live, so their images are readable too.
    images = await getHomepageImageUrls([
      ...new Set([
        ...[saved.lead, ...saved.featured, ...saved.readThis].flatMap(
          (story) => (story?.status === "published" ? [story.id] : []),
        ),
        ...[effective.lead, ...effective.featured, ...effective.readThis]
          .filter((story) => story !== null)
          .map((story) => story.id),
      ]),
    ]);
  } catch (error) {
    unstable_rethrow(error);
    return (
      <>
        <h1>Homepage</h1>
        <p role="alert">Unable to load homepage selections or stories.</p>
        <Link href="/dashboard/admin/homepage" prefetch={false}>
          Try again
        </Link>
      </>
    );
  }
  const { saved, effective } = curation;
  const savedIds = new Set(
    [saved.lead, ...saved.featured, ...saved.readThis].map(
      (story) => story?.id,
    ),
  );
  const live = [
    ...(effective.lead ? [{ ...effective.lead, group: "lead" as const }] : []),
    ...effective.featured.map((story) => ({
      ...story,
      group: "featured" as const,
    })),
    ...effective.readThis.map((story) => ({
      ...story,
      group: "readThis" as const,
    })),
  ];
  const liveIds = new Set(live.map((story) => story.id));
  const withImage = (story: HomepageArticle) => ({
    ...story,
    eligible: liveIds.has(story.id),
    imageUrl: images[story.id] ?? null,
  });
  return (
    <>
      <h1>Homepage</h1>
      <HomepageEditor
        version={curation.version}
        saved={{
          lead: saved.lead ? withImage(saved.lead) : null,
          featured: saved.featured.map(withImage),
          readThis: saved.readThis.map(withImage),
        }}
        automatic={live
          .filter((story) => !savedIds.has(story.id))
          .map((story) => ({ ...story, imageUrl: images[story.id] ?? null }))}
        library={{ items: library.items, nextCursor: library.nextCursor }}
      />
    </>
  );
}
