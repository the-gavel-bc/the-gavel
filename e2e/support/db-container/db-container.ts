export function dbContainer(scratchContainer?: string): string {
  // Dedicated scratch fixtures must keep their fixed database and API paired.
  const container =
    scratchContainer ??
    process.env.GAVEL_DB_CONTAINER ??
    "supabase_db_the-gavel";
  if (!/^supabase_db_[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container))
    throw new Error("Expected a local Supabase database container name.");
  return container;
}

export function assertMatchingDbPort(
  databaseUrl: string | undefined,
  publishedPorts: string,
): void {
  const url =
    databaseUrl && URL.canParse(databaseUrl) ? new URL(databaseUrl) : null;
  const ports = publishedPorts.trim().split(/\r?\n/);
  if (
    !url ||
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== "127.0.0.1" ||
    !url.port ||
    !ports.some(
      (port) =>
        port === `127.0.0.1:${url.port}` || port === `0.0.0.0:${url.port}`,
    )
  ) {
    throw new Error(
      "GAVEL_DB_CONTAINER does not match the local Supabase CLI project.",
    );
  }
}
