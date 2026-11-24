// Import a demo export into a Gavel database.
// Plan: docs/superpowers/plans/2026-11-24-demo-article-import.md
//
// Usage (dry run by default; --apply writes):
//   GAVEL_SUPABASE_URL=... GAVEL_SERVICE_ROLE_KEY=... node scripts/demo-import/import.mjs \
//     <export folder> --actor <administrator user id> [--apply] [--confirm <project ref>]
// A non-local target needs --confirm with the project ref in its URL.
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { altText, toPayload } from "./convert.mjs";

// Same limits and encoding as src/backend/media/image-intake (editor uploads).
const maxBytes = 10 * 1024 * 1024;
const maxSide = 6_000;
const maxPixels = 24_000_000;
const formats = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export async function processImage(bytes, declaredType) {
  if (bytes.byteLength < 1 || bytes.byteLength > maxBytes) return null;
  try {
    const meta = await sharp(bytes, {
      limitInputPixels: false,
      failOn: "error",
    }).metadata();
    if (formats[meta.format] !== declaredType) return null;
    if (
      !meta.width ||
      !meta.height ||
      meta.width > maxSide ||
      meta.height > maxSide ||
      meta.width * meta.height > maxPixels ||
      (meta.pages ?? 1) !== 1
    )
      return null;
    const out = await sharp(bytes, {
      limitInputPixels: maxPixels,
      failOn: "error",
    })
      .rotate()
      .webp({ quality: 82, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    if (out.data.byteLength > maxBytes) return null;
    return {
      bytes: out.data,
      width: out.info.width,
      height: out.info.height,
      sha256: createHash("sha256").update(out.data).digest("hex"),
    };
  } catch {
    return null;
  }
}

function args(argv) {
  const options = { folder: null, actor: null, apply: false, confirm: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--apply") options.apply = true;
    else if (argv[i] === "--actor") options.actor = argv[++i];
    else if (argv[i] === "--confirm") options.confirm = argv[++i];
    else options.folder = argv[i];
  }
  return options;
}

async function main() {
  const options = args(process.argv.slice(2));
  const url = process.env.GAVEL_SUPABASE_URL;
  const key = process.env.GAVEL_SERVICE_ROLE_KEY;
  if (!url || !key || !options.folder || !options.actor) {
    console.error(
      "Set GAVEL_SUPABASE_URL and GAVEL_SERVICE_ROLE_KEY; pass <export folder> --actor <user id>.",
    );
    process.exit(2);
  }
  const host = new URL(url).hostname;
  const local = host === "127.0.0.1" || host === "localhost";
  if (!local && options.confirm !== host.split(".")[0]) {
    console.error(
      `Refusing a non-local target. Pass --confirm ${host.split(".")[0]} to proceed.`,
    );
    process.exit(2);
  }
  const map = JSON.parse(
    await readFile(
      fileURLToPath(new URL("./taxonomy-map.json", import.meta.url)),
      "utf8",
    ),
  );
  const { articles } = JSON.parse(
    await readFile(join(options.folder, "demo-export.json"), "utf8"),
  );
  const client = createClient(url, key, { auth: { persistSession: false } });
  const bucket = client.storage.from("article-media");
  const report = {
    imported: [],
    skipped: [],
    already: 0,
    failed: [],
    noPhoto: [],
    slugChanged: [],
    droppedLinks: 0,
  };

  for (const article of articles) {
    const converted = toPayload(article, map);
    if (!converted.ok) {
      report.skipped.push(`${article.slug}: ${converted.reason}`);
      continue;
    }
    report.droppedLinks += converted.droppedLinks;
    const payload = { ...converted.payload, articleId: randomUUID() };
    let image = null;
    let processed = null;
    if (article.image_file) {
      const bytes = await readFile(
        join(options.folder, "images", article.image_file),
      );
      processed = await processImage(bytes, article.image_type);
      if (processed) {
        const assetId = randomUUID();
        image = {
          assetId,
          objectKey: `${payload.articleId}/${assetId}.webp`,
          byteSize: processed.bytes.byteLength,
          width: processed.width,
          height: processed.height,
          sha256: processed.sha256,
          alt: altText(article),
          credit:
            (article.image_credit ?? "").trim().slice(0, 240) || "The Gavel",
          caption: (article.image_caption ?? "").trim().slice(0, 400) || null,
        };
      }
    }
    if (!image) report.noPhoto.push(article.slug);
    const call = (dryRun) =>
      client.rpc("import_demo_article", {
        p_actor_user_id: options.actor,
        p_payload: payload,
        p_image: image,
        p_dry_run: dryRun,
      });
    // Every article is checked by the database first, so nothing is uploaded
    // for an article that would be refused or is already imported.
    const check = await call(true);
    if (check.error || !check.data?.ok) {
      report.failed.push(
        `${article.slug}: ${check.data?.reason ?? check.data?.code ?? check.error?.message}`,
      );
      continue;
    }
    if (check.data.skipped) {
      report.already++;
      continue;
    }
    if (check.data.slugChanged)
      report.slugChanged.push(`${article.slug} -> ${check.data.slug}`);
    if (!options.apply) {
      report.imported.push(check.data.slug);
      continue;
    }
    if (image) {
      const { error } = await bucket.upload(image.objectKey, processed.bytes, {
        contentType: "image/webp",
        upsert: false,
        headers: { "cache-control": "no-store" },
      });
      if (error) {
        report.failed.push(`${article.slug}: image upload failed`);
        continue;
      }
    }
    const done = await call(false);
    if (done.error || !done.data?.ok || done.data.skipped) {
      // Remove the object this attempt uploaded; nothing references it.
      if (image) await bucket.remove([image.objectKey]);
      report.failed.push(
        `${article.slug}: ${done.data?.reason ?? done.data?.code ?? done.error?.message ?? "skipped"}`,
      );
      continue;
    }
    report.imported.push(done.data.slug);
  }

  const featured = articles.filter((a) => a.featured).map((a) => a.slug);
  console.log(
    `${options.apply ? "Imported" : "Would import"}: ${report.imported.length}`,
  );
  console.log(`Already imported: ${report.already}`);
  console.log(`Skipped by conversion: ${report.skipped.length}`);
  report.skipped.forEach((line) => console.log(`  ${line}`));
  console.log(`Refused or failed: ${report.failed.length}`);
  report.failed.forEach((line) => console.log(`  ${line}`));
  console.log(`Without a main photo: ${report.noPhoto.length}`);
  report.noPhoto.forEach((line) => console.log(`  ${line}`));
  console.log(`Slug changed: ${report.slugChanged.length}`);
  report.slugChanged.forEach((line) => console.log(`  ${line}`));
  console.log(`Links kept as plain text: ${report.droppedLinks}`);
  console.log(
    `Featured on the demo (pick for the homepage by hand): ${featured.length}`,
  );
  featured.forEach((line) => console.log(`  ${line}`));
  if (report.failed.length) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
