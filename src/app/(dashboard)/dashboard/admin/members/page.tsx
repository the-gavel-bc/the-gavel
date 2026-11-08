import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { requireActiveMembership } from "@/backend/auth/access/access";
import {
  listMembers,
  memberStateSchema,
} from "@/backend/memberships/member-directory/member-directory";
import { AdminMemberList } from "@/components/dashboard/admin-members/admin-member-list";

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
  try {
    page = await listMembers(input);
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
  return (
    <>
      <h1>Memberships</h1>
      <p>
        Approve only people who have signed in with a confirmed BC Google
        account.
      </p>
      <p>
        <Link href="/dashboard/admin/articles">Article management</Link>
      </p>
      <p>
        <Link href="/dashboard/admin/members/audit">Membership activity</Link>
      </p>
      <AdminMemberList
        key={state.success ? state.data : "all"}
        page={page}
        state={state.success ? state.data : "all"}
        currentUserId={access.userId}
      />
    </>
  );
}
