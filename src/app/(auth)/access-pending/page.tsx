import { redirect } from "next/navigation";
import { PublicShell } from "@/components/site/public-shell/public-shell";
import { Button } from "@/components/ui/button/button";
import { getCurrentAccess } from "@/backend/auth/access/access";
import { signOut } from "@/backend/auth/actions/actions";
export default async function AccessPendingPage() {
  const access = await getCurrentAccess();
  if (access.status === "signedOut") redirect("/sign-in");
  if (access.status === "active") redirect("/dashboard");
  return (
    <PublicShell>
      <h1>Access pending</h1>
      <p>
        Dashboard access requires an approved Boston College Google account.
        Contact a publication administrator for help.
      </p>
      <form action={signOut}>
        <Button type="submit">Sign out</Button>
      </form>
    </PublicShell>
  );
}
