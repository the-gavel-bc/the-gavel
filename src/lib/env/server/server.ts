import { z } from "zod";
import { httpOriginSchema, publishableKeySchema } from "../schema/schema";

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: httpOriginSchema,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKeySchema,
  SITE_URL: httpOriginSchema,
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
