import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { requireActiveMembership } from "@/backend/auth/access/access";
import { getDraftOptions } from "@/backend/articles/draft-queries/draft-queries";
import { DraftForm } from "@/components/dashboard/draft-form/draft-form";
import type { DraftInput } from "@/shared/articles/draft-contract/draft-contract";
export default async function NewDraftPage() {
  await requireActiveMembership();
  let options;
  try {
    options = await getDraftOptions();
  } catch (error) {
    unstable_rethrow(error);
    return (
      <>
        <h1>New draft</h1>
        <p role="alert">Unable to load draft options. Try again.</p>
        <Link href="/dashboard/articles/new" prefetch={false}>
          Try again
        </Link>
      </>
    );
  }
  const initialDraft: DraftInput = {
    schemaVersion: 1,
    title: "",
    sectionId: "",
    excerpt: null,
    content: null,
    seoKeyphrase: null,
    metaDescription: null,
    categoryIds: [],
    tagIds: [],
    contributors: [],
  };
  return (
    <>
      <h1>New draft</h1>
      <DraftForm initialDraft={initialDraft} options={options} />
    </>
  );
}
