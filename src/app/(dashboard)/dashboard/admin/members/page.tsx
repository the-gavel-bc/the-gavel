import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { requireActiveMembership } from "@/backend/auth/access/access";
import {
  listMembers,
  memberRoleSchema,
  memberStateSchema,
  staffSummary,
} from "@/backend/memberships/member-directory/member-directory";
import { AdminMemberList } from "@/frontend/features/memberships/components/admin-members/admin-member-list";

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await requireActiveMembership();
  if (access.role !== "administrator")
    return (
      <>
        <h1>Memberships</h1>
        <p role="alert">Administrator access required.</p>
        <Link href="/dashboard">My articles</Link>
      </>
    );
  const input = await searchParams;
  let page;
  let summary;
  try {
    [page, summary] = await Promise.all([listMembers(input), staffSummary()]);
  } catch (error) {
    unstable_rethrow(error);
    return (
      <>
        <h1>Memberships</h1>
        <p role="alert">
          Unable to load memberships. Check the filter or try again.
        </p>
        <Link href="/dashboard/admin/members" prefetch={false}>
          Reset filter
        </Link>
      </>
    );
  }
  const state = memberStateSchema.safeParse(input.state);
  const role = memberRoleSchema.safeParse(input.role);
  return (
    <>
      <h1>Memberships</h1>
      <p>
        <Link href="/dashboard/admin/members/audit">Membership activity</Link>
      </p>
      <AdminMemberList
        page={page}
        summary={summary}
        filters={{
          state: state.success ? state.data : "all",
          role: role.success ? role.data : null,
          search: typeof input.q === "string" ? input.q.trim() : "",
        }}
        currentUserId={access.userId}
      />
    </>
  );
}
