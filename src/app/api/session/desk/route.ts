import { cookies } from "next/headers";
import { getCurrentAccess } from "@/backend/auth/access/access";

export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
const none = () => Response.json({ desk: null }, { headers });

// Tells the public reader whether to show the staff desk shortcut. Public pages
// skip session refresh, so they ask here: a route handler can persist a
// refreshed session cookie, which a Server Component cannot. Visitors without
// an auth cookie never reach Supabase.
export async function GET() {
  const store = await cookies();
  if (
    !store.getAll().some(({ name }) => /^sb-.+-auth-token(\.\d+)?$/.test(name))
  )
    return none();
  try {
    const access = await getCurrentAccess();
    if (access.status !== "active") return none();
    return Response.json(
      { desk: { displayName: access.displayName, role: access.role } },
      { headers },
    );
  } catch {
    return none();
  }
}
