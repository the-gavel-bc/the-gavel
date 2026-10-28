"use client";
import { Button } from "@/components/ui/button/button";
import { useDraftLeaveCheck } from "../draft-navigation-guard/draft-navigation-guard";
export function DashboardSignOutForm({
  action,
}: {
  action: () => Promise<void>;
}) {
  const leave = useDraftLeaveCheck();
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!leave()) event.preventDefault();
      }}
    >
      <Button type="submit">Sign out</Button>
    </form>
  );
}
