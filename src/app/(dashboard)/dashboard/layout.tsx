import type { ReactNode } from "react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell/dashboard-shell";
import { requireActiveMembership } from "@/lib/auth/access/access";
import { signOut } from "@/lib/auth/actions/actions";
import { Button } from "@/components/ui/button/button";
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const access = await requireActiveMembership();
  return (
    <DashboardShell
      displayName={access.displayName}
      isAdmin={access.role === "administrator"}
    >
      {children}
      <form action={signOut}>
        <Button type="submit">Sign out</Button>
      </form>
    </DashboardShell>
  );
}
