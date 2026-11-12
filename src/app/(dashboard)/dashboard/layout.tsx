import { excludedMetadata } from "@/backend/reader/public-metadata/public-metadata";
import type { ReactNode } from "react";
import { DashboardShell } from "@/frontend/components/dashboard/dashboard-shell/dashboard-shell";
import { requireActiveMembership } from "@/backend/auth/access/access";
import { signOut } from "@/backend/auth/actions/actions";
import { DashboardSignOutForm } from "@/frontend/features/auth/components/dashboard-sign-out-form/dashboard-sign-out-form";
import { DraftNavigationProvider } from "@/frontend/components/dashboard/draft-navigation-guard/draft-navigation-guard";
export const metadata = excludedMetadata("Dashboard");
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const access = await requireActiveMembership();
  return (
    <DraftNavigationProvider>
      <DashboardShell
        displayName={access.displayName}
        isAdmin={access.role === "administrator"}
        accountAction={<DashboardSignOutForm action={signOut} />}
      >
        {children}
      </DashboardShell>
    </DraftNavigationProvider>
  );
}
