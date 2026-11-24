// Export the demo site's articles to a local snapshot for review and import.
// Plan: docs/superpowers/plans/2026-11-24-demo-article-import.md
//
// Usage:
//   DEMO_SUPABASE_URL=https://<ref>.supabase.co DEMO_SUPABASE_KEY=<key> \
//     node scripts/demo-import/export.mjs <output-folder outside the repository>
//
// With the demo's publishable key only published articles are visible (RLS);
// a service key also returns drafts. Keys are read from the environment only.
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const columns =
  "id,slug,section,title,excerpt,body,image_url,image_alt,image_caption,image_credit," +
  "correction,author_name,status,featured,published_at,content_updated_at,created_at," +
  "categories(name,slug,section),tags(name,slug)";
const maxImageBytes = 10 * 1024 * 1024;
const pageSize = 500;
const imageTypes = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Only images in the demo project's own public bucket are fetched.
export function demoImagePath(imageUrl, demoUrl) {
  let url;
  try {
    url = new URL(imageUrl);
  } catch {
    return null;
  }
  const marker = "/storage/v1/object/public/article-images/";
  return url.origin === new URL(demoUrl).origin &&
    url.pathname.startsWith(marker) &&
    !url.search &&
    !url.hash
    ? url.pathname.slice(marker.length)
    : null;
}

async function fetchJson(url, headers) {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(`Demo read failed with HTTP ${response.status}.`);
  return response.json();
}

async function download(url) {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return { error: `HTTP ${response.status}` };
  const type = (response.headers.get("content-type") ?? "").split(";")[0];
  if (!imageTypes[type]) return { error: `unsupported type ${type || "none"}` };
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxImageBytes) return { error: "larger than 10 MB" };
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > maxImageBytes) return { error: "larger than 10 MB" };
  return { bytes, type };
}

async function main() {
  const demoUrl = process.env.DEMO_SUPABASE_URL;
  const key = process.env.DEMO_SUPABASE_KEY;
  const out = process.argv[2];
  if (!demoUrl || !key || !out) {
    console.error(
      "Set DEMO_SUPABASE_URL and DEMO_SUPABASE_KEY and pass an output folder.",
    );
    process.exit(2);
  }
  const folder = resolve(out);
  const repo = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const inside = relative(repo, folder);
  if (!inside.startsWith("..") && !isAbsolute(inside)) {
    console.error("Choose an output folder outside the repository.");
    process.exit(2);
  }
  await mkdir(join(folder, "images"), { recursive: true });
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const articles = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await fetchJson(
      `${demoUrl}/rest/v1/articles?select=${columns}&order=created_at.asc,id.asc` +
        `&limit=${pageSize}&offset=${offset}`,
      headers,
    );
    articles.push(...page);
    if (page.length < pageSize) break;
  }
  let images = 0;
  for (const article of articles) {
    article.image_file = null;
    article.image_error = null;
    if (!article.image_url) continue;
    if (!demoImagePath(article.image_url, demoUrl)) {
      article.image_error = "not in the demo image bucket";
      continue;
    }
    const result = await download(article.image_url);
    if (result.error) {
      article.image_error = result.error;
      continue;
    }
    const name = `${createHash("sha256").update(result.bytes).digest("hex")}.${imageTypes[result.type]}`;
    await writeFile(join(folder, "images", name), result.bytes);
    article.image_file = name;
    article.image_type = result.type;
    images++;
  }
  await writeFile(
    join(folder, "demo-export.json"),
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        source: new URL(demoUrl).host,
        articles,
      },
      null,
      2,
    ),
  );
  const drafts = articles.filter((a) => a.status === "draft").length;
  console.log(
    `Exported ${articles.length} articles (${drafts} drafts) and ${images} images to ${folder}.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
