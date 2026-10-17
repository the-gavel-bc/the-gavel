import { z } from "zod";

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SITE_URL: z.url(),
});

export type ServerEnv = Readonly<z.infer<typeof serverEnvSchema>>;

export function getServerEnv(
  source: NodeJS.ProcessEnv = process.env,
): ServerEnv {
  const parsed = serverEnvSchema.safeParse(source);

  if (!parsed.success) {
    const variableNames = [
      ...new Set(parsed.error.issues.map((issue) => issue.path.join("."))),
    ];
    throw new Error(
      `Invalid server environment variables: ${variableNames.join(", ")}`,
    );
  }

  return Object.freeze(parsed.data);
}
