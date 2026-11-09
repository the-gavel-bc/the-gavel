import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { requireActiveMembership } from "@/backend/auth/access/access";
import {
  auditActionSchema,
  listAuditEvents,
} from "@/backend/articles/admin-audit/admin-audit";
import { AdminAudit } from "@/frontend/features/articles/components/admin-audit/admin-audit";

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await requireActiveMembership();
  if (access.role !== "administrator")
    return (
      <>
        <h1>Article activity</h1>
        <p role="alert">Administrator access required.</p>
        <Link href="/dashboard">My articles</Link>
      </>
    );

  const input = await searchParams;
  const request = { ...input };
  if (request.action === "all") delete request.action;
  let page;
  try {
    page = await listAuditEvents(request);
  } catch (error) {
    unstable_rethrow(error);
    return (
      <>
        <h1>Article activity</h1>
        <p role="alert">
          Unable to load article activity. Check the filter or try again.
        </p>
        <Link href="/dashboard/admin/audit" prefetch={false}>
          Reset filter
        </Link>
      </>
    );
  }
  const action = auditActionSchema.safeParse(input.action);
  return (
    <>
      <h1>Article activity</h1>
      <p>
        <Link href="/dashboard/admin/articles">Article management</Link>
      </p>
      <AdminAudit
        key={action.success ? action.data : "all"}
        page={page}
        action={action.success ? action.data : null}
      />
    </>
  );
}
