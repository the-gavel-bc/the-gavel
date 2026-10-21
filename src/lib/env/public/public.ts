import { z } from "zod";
import { httpOriginSchema, publishableKeySchema } from "../schema/schema";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: httpOriginSchema,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKeySchema,
});

export type PublicEnvSource = Record<string, string | undefined>;

export type PublicEnv = Readonly<z.infer<typeof publicEnvSchema>>;

function publicEnvironmentSource(): PublicEnvSource {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

export function getPublicEnv(
  source: PublicEnvSource = publicEnvironmentSource(),
): PublicEnv {
  const parsed = publicEnvSchema.safeParse(source);

  if (!parsed.success) {
    const variableNames = [
      ...new Set(parsed.error.issues.map((issue) => issue.path.join("."))),
    ];
    throw new Error(
      `Invalid public environment variables: ${variableNames.join(", ")}`,
    );
  }

  return Object.freeze(parsed.data);
}
