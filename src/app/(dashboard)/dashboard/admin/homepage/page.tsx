import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { requireActiveMembership } from "@/backend/auth/access/access";
import { getHomepageImageUrls } from "@/backend/homepage/homepage-curation/homepage-images";
import { listHomepageStoriesAction } from "@/backend/homepage/homepage-curation/homepage-stories-action";
import { getAdminHomepageCuration } from "@/backend/homepage/homepage-curation/homepage-curation";
import { HomepageEditor } from "@/frontend/features/homepage/components/admin-homepage/homepage-editor";

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
    const saved = curation.saved;
    images = await getHomepageImageUrls(
      [saved.lead, ...saved.featured, ...saved.readThis]
        .filter((story) => story !== null)
        .map((story) => story.id),
    );
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
  const withImage = (story: {
    id: string;
    title: string;
    status: "draft" | "published" | "archived";
  }) => ({
    ...story,
    imageUrl: images[story.id] ?? null,
  });
  return (
    <>
      <h1>Homepage</h1>
      <HomepageEditor
        version={curation.version}
        saved={{
          lead: curation.saved.lead ? withImage(curation.saved.lead) : null,
          featured: curation.saved.featured.map(withImage),
          readThis: curation.saved.readThis.map(withImage),
        }}
        library={{ items: library.items, nextCursor: library.nextCursor }}
      />
    </>
  );
}
