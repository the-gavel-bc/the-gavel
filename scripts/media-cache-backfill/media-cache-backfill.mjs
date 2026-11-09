import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export async function backfillAsset(
  client,
  origin,
  key,
  asset,
  fetcher = fetch,
) {
  const expected = `${asset.article_id}/${asset.id}.webp`;
  if (
    asset.object_key !== expected ||
    !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/u.test(expected)
  )
    throw new Error("Unexpected object path");
  const download = async () => {
    const response = await fetcher(
      `${origin}/storage/v1/object/authenticated/article-media/${expected}`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "no-store",
      },
    );
    if (
      !response.ok ||
      response.headers.get("content-type")?.split(";")[0] !== "image/webp"
    )
      throw new Error("Image download failed");
    const size = Number(response.headers.get("content-length"));
    if (!Number.isInteger(size) || size < 1 || size > 10485760)
      throw new Error("Unexpected image size");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== size || hash(bytes) !== asset.sha256)
      throw new Error("Image hash mismatch");
    return {
      bytes,
      noStore: response.headers.get("cache-control") === "no-store",
    };
  };
  const original = await download();
  if (original.noStore) return "verified";
  const current = await client
    .from("media_assets")
    .select("status,sha256,object_key")
    .eq("id", asset.id)
    .single();
  if (
    current.error ||
    current.data.status !== "finalized" ||
    current.data.sha256 !== asset.sha256 ||
    current.data.object_key !== expected
  )
    throw new Error("Asset changed; stop maintenance");
  // Writers and cleanup must be stopped: a row recheck alone cannot serialize a Storage rewrite.
  const updated = await client.storage
    .from("article-media")
    .update(expected, original.bytes, {
      contentType: "image/webp",
      headers: { "cache-control": "no-store" },
    });
  if (updated.error) throw new Error("Storage rewrite failed");
  if (!(await download()).noStore)
    throw new Error("Cache header verification failed");
  return "updated";
}

async function main() {
  const args = process.argv.slice(2);
  const allowed = new Set(["--confirm-maintenance", "--limit", "--after"]);
  for (let i = 0; i < args.length; i++) {
    if (!allowed.has(args[i])) throw new Error("Unknown argument");
    if (args[i] !== "--confirm-maintenance") i++;
  }
  if (!args.includes("--confirm-maintenance"))
    throw new Error(
      "Stop app writers, cron and cleanup workers first; pass --confirm-maintenance",
    );
  const value = (name) =>
    args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  const limit = Number(value("--limit") ?? 25),
    after = value("--after");
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    (after !== undefined &&
      !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(after))
  )
    throw new Error("Invalid limit or cursor");
  const origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin;
  if (
    !origin.startsWith("https:") &&
    !["localhost", "127.0.0.1"].includes(new URL(origin).hostname)
  )
    throw new Error("HTTPS required");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Service key required");
  const client = createClient(origin, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bucket = await client.storage.getBucket("article-media");
  if (bucket.error || bucket.data.public !== false)
    throw new Error("Expected private bucket");
  let query = client
    .from("media_assets")
    .select("id,article_id,object_key,sha256")
    .eq("status", "finalized")
    .order("id")
    .limit(limit);
  if (after) query = query.gt("id", after);
  const page = await query;
  if (page.error) throw new Error("Asset scan failed");
  let resumeAfter = after ?? null;
  for (const asset of page.data) {
    try {
      const outcome = await backfillAsset(client, origin, key, asset);
      resumeAfter = asset.id;
      console.log(JSON.stringify({ id: asset.id, outcome, resumeAfter }));
    } catch {
      console.error(
        JSON.stringify({ id: asset.id, outcome: "failed", resumeAfter }),
      );
      process.exitCode = 1;
      return;
    }
  }
  console.log(
    JSON.stringify({
      scanned: page.data.length,
      resumeAfter,
      morePossible: page.data.length === limit,
    }),
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => {
    console.error(
      "Backfill stopped; verify arguments, maintenance state and environment.",
    );
    process.exitCode = 1;
  });
