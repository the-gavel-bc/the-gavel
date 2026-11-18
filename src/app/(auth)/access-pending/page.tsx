import { excludedMetadata } from "@/backend/reader/public-metadata/public-metadata";
import { redirect } from "next/navigation";
import { PublicShell } from "@/frontend/components/site/public-shell/public-shell";
import { Button } from "@/frontend/components/ui/button/button";
import { getCurrentAccess } from "@/backend/auth/access/access";
import { signOut } from "@/backend/auth/actions/actions";
export const metadata = excludedMetadata("Access not approved");
export default async function AccessPendingPage() {
  const access = await getCurrentAccess();
  if (access.status === "signedOut") redirect("/sign-in");
  if (access.status === "active") redirect("/dashboard");
  return (
    <PublicShell>
      <h1>Access not approved</h1>
      <p>
        This Boston College account does not have staff access. Ask a
        publication administrator to add or reactivate your BC email, then sign
        in again.
      </p>
      <form action={signOut}>
        <Button type="submit">Sign out</Button>
      </form>
    </PublicShell>
  );
}
