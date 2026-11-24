// Pure conversion from a demo article to the Gavel import payload.
// Plan: docs/superpowers/plans/2026-11-24-demo-article-import.md
// The database function re-validates everything; these rules only shape the input.

// Same pattern the demo renderer uses for inline links.
const LINK = /\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g;
// Control and bidirectional formatting characters the Gavel validators refuse.
const UNSAFE =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f؜‎‏‪-‮⁦-⁩]/gu;

const clean = (value) => value.replace(UNSAFE, "");

// A conservative subset of Gavel's link rule (http and https with a plain
// host); anything else stays as text. The database decides finally.
export function isImportableLink(href) {
  if (href.length > 2048 || /[\s\\]/u.test(href)) return false;
  let url;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  return (
    (url.protocol === "http:" || url.protocol === "https:") &&
    !url.username &&
    !url.password &&
    /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(url.hostname) &&
    !/(^|\.)xn--/u.test(url.hostname) &&
    !/^[0-9.]+$/u.test(url.hostname)
  );
}

function inline(text, report) {
  const nodes = [];
  const push = (value, marks) => {
    const lines = clean(value).split("\n");
    lines.forEach((line, index) => {
      if (index > 0) nodes.push({ type: "hardBreak" });
      if (line)
        nodes.push(
          marks
            ? { type: "text", text: line, marks }
            : { type: "text", text: line },
        );
    });
  };
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    push(text.slice(last, match.index));
    if (isImportableLink(match[2]))
      push(match[1], [{ type: "link", attrs: { href: match[2] } }]);
    else {
      report.droppedLinks++;
      push(match[1]);
    }
    last = match.index + match[0].length;
  }
  push(text.slice(last));
  // No leading or trailing line breaks inside a block.
  while (nodes[0]?.type === "hardBreak") nodes.shift();
  while (nodes.at(-1)?.type === "hardBreak") nodes.pop();
  return nodes;
}

export function toDocument(body) {
  const report = { droppedLinks: 0 };
  const content = body
    .replace(/\r\n?/gu, "\n")
    .split(/\n\s*\n/u)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) =>
      block.startsWith("## ")
        ? {
            type: "heading",
            attrs: { level: 2 },
            content: inline(block.slice(3).trim(), report),
          }
        : { type: "paragraph", content: inline(block, report) },
    )
    .filter((block) => block.content.length > 0);
  return {
    content: content.length
      ? {
          format: "gavel-draft",
          version: 1,
          document: { type: "doc", content },
        }
      : null,
    droppedLinks: report.droppedLinks,
  };
}

// map: { "section/category": { section, category|null }, "section/": {...} }
export function mapTaxonomy(article, map) {
  const keys = article.categories.length
    ? article.categories.map((c) => `${article.section}/${c.slug}`)
    : [`${article.section}/`];
  const targets = [];
  for (const key of keys) {
    const target = map[key];
    if (!target) return { ok: false, reason: `no mapping for ${key}` };
    targets.push(target);
  }
  const section = targets[0].section;
  const categories = [
    ...new Set(
      targets
        .filter((t) => t.section === section && t.category)
        .map((t) => t.category),
    ),
  ];
  return { ok: true, section, categories };
}

const trimTo = (value, max) => {
  const text = clean(value ?? "")
    .replace(/\s+/gu, " ")
    .trim();
  if ([...text].length <= max) return text || null;
  return (
    [...text]
      .slice(0, max - 1)
      .join("")
      .trimEnd() + "…"
  );
};

// Case-insensitive duplicates collapse to the first spelling, like ensure_tag.
function uniqueTags(tags) {
  const seen = new Map();
  for (const tag of tags) {
    const name = trimTo(tag.name, 120);
    if (name && !seen.has(name.toLowerCase()))
      seen.set(name.toLowerCase(), name);
  }
  return [...seen.values()];
}

// Approved default: caption, otherwise "Photo for <title>".
export function altText(article) {
  return (
    trimTo(article.image_alt, 240) ??
    trimTo(article.image_caption, 240) ??
    trimTo(`Photo for ${article.title}`, 240)
  );
}

export function toPayload(article, map) {
  const taxonomy = mapTaxonomy(article, map);
  if (!taxonomy.ok) return { ok: false, reason: taxonomy.reason };
  const body = toDocument(article.body ?? "");
  if (article.status === "published" && !body.content)
    return { ok: false, reason: "published article has an empty body" };
  const title = trimTo(article.title, 240);
  if (!title) return { ok: false, reason: "missing title" };
  const correction = trimTo(article.correction, 2000);
  return {
    ok: true,
    droppedLinks: body.droppedLinks,
    payload: {
      sourceId: article.id,
      status: article.status === "published" ? "published" : "draft",
      slug: article.slug,
      title,
      excerpt: trimTo(article.excerpt, 600),
      content: body.content,
      section: taxonomy.section,
      categories: taxonomy.categories,
      tags: uniqueTags(article.tags),
      writer: trimTo(article.author_name, 120),
      publishedAt: article.published_at,
      correction,
      correctedAt: correction ? (article.content_updated_at ?? null) : null,
    },
  };
}
