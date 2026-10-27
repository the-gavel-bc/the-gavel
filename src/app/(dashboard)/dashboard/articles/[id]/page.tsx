import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import { requireActiveMembership } from "@/lib/auth/access/access";
import {
  getDraftDetail,
  getDraftOptions,
} from "@/lib/articles/draft-queries/draft-queries";
import { isDraftUuid } from "@/lib/articles/draft-contract/draft-contract";
import { DraftForm } from "@/components/dashboard/draft-form/draft-form";
export default async function EditDraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireActiveMembership();
  const { id } = await params;
  if (!isDraftUuid(id)) notFound();
  const recovery = (
    <>
      <h1>Article details</h1>
      <p role="alert">Unable to load this draft. Try again.</p>
      <Link href={`/dashboard/articles/${id}`} prefetch={false}>
        Try again
      </Link>
    </>
  );
  let detail;
  try {
    detail = await getDraftDetail(id);
  } catch (error) {
    unstable_rethrow(error);
    return recovery;
  }
  if (detail.kind === "notFound") notFound();
  if (detail.kind === "readOnly")
    return (
      <>
        <h1>Article details</h1>
        <p>This article is {detail.status}. Draft editing is unavailable.</p>
        <Link href="/dashboard">My articles</Link>
      </>
    );
  if (detail.kind === "unsupportedContent")
    return (
      <>
        <h1>Article details</h1>
        <p role="alert">
          This draft’s body format is unsupported. Its content has been
          preserved; editing is unavailable.
        </p>
        <Link href="/dashboard">My articles</Link>
      </>
    );
  let options;
  try {
    options = await getDraftOptions(detail.draft.sectionId);
  } catch (error) {
    unstable_rethrow(error);
    return recovery;
  }

  return (
    <>
      <h1>Edit draft</h1>
      <DraftForm
        key={detail.articleId}
        initialDraft={detail.draft}
        options={options}
        article={{
          id: detail.articleId,
          version: detail.version,
          updatedAt: detail.updatedAt,
        }}
      />
    </>
  );
}
