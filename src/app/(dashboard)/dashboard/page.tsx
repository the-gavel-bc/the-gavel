import { requireActiveMembership } from "@/lib/auth/access/access";
export default async function DashboardPage() {
  await requireActiveMembership();
  return (
    <>
      <h1>My articles</h1>
      <p>
        Your dashboard is ready. Article editing will be available in a later
        phase.
      </p>
    </>
  );
}
