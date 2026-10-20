import { redirect } from "next/navigation";
import { PublicShell } from "@/components/site/public-shell";
import { Button } from "@/components/ui/button";
import { getCurrentAccess } from "@/lib/auth/access";
import { signInWithGoogle } from "@/lib/auth/actions";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const access = await getCurrentAccess();
  if (access.status === "active") redirect("/dashboard");
  if (access.status === "pending") redirect("/access-pending");
  const { error } = await searchParams;
  return (
    <PublicShell>
      <h1>Member sign in</h1>
      <p>
        Use your Boston College Google account. Dashboard access requires
        administrator approval.
      </p>
      {error ? (
        <p role="alert">Sign-in could not be completed. Please try again.</p>
      ) : null}
      <form action={signInWithGoogle}>
        <Button type="submit">Continue with Google</Button>
      </form>
    </PublicShell>
  );
}
