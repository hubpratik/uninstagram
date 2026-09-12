/**
 * Adds the white frame to photos that were uploaded before framing existed.
 *
 * Run with:  npm run frame-existing
 *            npm run frame-existing -- --dry-run
 *
 * Two things worth knowing about how this works:
 *
 * 1. The originals are not kept anywhere, so everything it is about to touch is
 *    copied into data/backup-<timestamp>/ first.
 * 2. It writes each framed photo under a NEW key rather than overwriting the old
 *    one. /api/media serves keys as immutable for a year, so a photo rewritten
 *    in place would keep showing the unframed version in every browser that had
 *    already loaded it. A new key is a new URL, which no cache can stale.
 *
 * Idempotent: assets already marked `framed` in posts.json are skipped.
 * Only the full-size copy is framed, matching new uploads — the grid crops
 * thumbnails to squares, which would slice a baked-in border unevenly.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

const ROOT = process.cwd();
const DATA = path.join(ROOT, "data");
const UPLOADS = path.join(DATA, "uploads");
const POSTS = path.join(DATA, "posts.json");

const dryRun = process.argv.includes("--dry-run");

// Re-encoding an already-compressed WebP costs a little quality, so this one-off
// uses a higher setting than the upload path to keep the loss invisible.
const QUALITY = 92;
const DEFAULT_BORDER_PERCENT = 2.2;

async function borderPercent() {
  const fromArg = process.argv.find((arg) => arg.startsWith("--percent="));
  if (fromArg) return Number(fromArg.split("=")[1]);

  try {
    const env = await fs.readFile(path.join(ROOT, ".env.local"), "utf8");
    const line = env.split(/\r?\n/).find((l) => l.startsWith("UNINSTAGRAM_BORDER_PERCENT="));
    const value = Number(line?.split("=")[1]?.trim());
    if (Number.isFinite(value) && value > 0) return value;
  } catch {
    /* No .env.local is fine; fall through to the default. */
  }
  return DEFAULT_BORDER_PERCENT;
}

async function main() {
  const percent = await borderPercent();
  const posts = JSON.parse(await fs.readFile(POSTS, "utf8"));

  const todo = [];
  for (const post of posts) {
    for (const asset of post.media) {
      if (!asset.framed) todo.push({ post, asset });
    }
  }

  if (todo.length === 0) {
    console.log("Every photo already has a frame. Nothing to do.");
    return;
  }

  console.log(`Framing ${todo.length} photo(s) at ${percent}% of the longest edge.`);
  if (dryRun) {
    for (const { post, asset } of todo) {
      console.log(`  would frame ${asset.key}  (post "${post.caption.slice(0, 40)}")`);
    }
    console.log("\nDry run — nothing was written.");
    return;
  }

  const backup = path.join(DATA, `backup-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  await fs.mkdir(backup, { recursive: true });
  await fs.copyFile(POSTS, path.join(backup, "posts.json"));
  for (const { asset } of todo) {
    await fs.copyFile(path.join(UPLOADS, asset.key), path.join(backup, asset.key));
    await fs.copyFile(path.join(UPLOADS, asset.thumbKey), path.join(backup, asset.thumbKey));
  }
  console.log(`Backed up ${todo.length * 2 + 1} file(s) to ${path.relative(ROOT, backup)}`);

  const retired = [];

  for (const { asset } of todo) {
    const oldKey = asset.key;
    const oldThumbKey = asset.thumbKey;

    const image = sharp(await fs.readFile(path.join(UPLOADS, oldKey)));
    const meta = await image.metadata();
    const edge = Math.max(2, Math.round((Math.max(meta.width, meta.height) * percent) / 100));

    const framed = await image
      .extend({
        top: edge,
        bottom: edge,
        left: edge,
        right: edge,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .webp({ quality: QUALITY })
      .toBuffer();

    const id = randomUUID();
    const key = `${id}.webp`;
    const thumbKey = `${id}_t.webp`;

    // New files first, records second, old files last: a crash part way through
    // leaves unused files behind rather than records pointing at nothing.
    await fs.writeFile(path.join(UPLOADS, key), framed);
    await fs.copyFile(path.join(UPLOADS, oldThumbKey), path.join(UPLOADS, thumbKey));

    asset.key = key;
    asset.thumbKey = thumbKey;
    asset.width = meta.width + edge * 2;
    asset.height = meta.height + edge * 2;
    asset.framed = true;

    retired.push(oldKey, oldThumbKey);
    console.log(
      `  ${oldKey.slice(0, 8)}… ${meta.width}x${meta.height}` +
        ` -> ${key.slice(0, 8)}… ${asset.width}x${asset.height}`,
    );
  }

  await fs.writeFile(POSTS, `${JSON.stringify(posts, null, 2)}\n`, "utf8");

  for (const key of retired) {
    await fs.rm(path.join(UPLOADS, key), { force: true });
  }

  console.log(`\nDone. posts.json updated, ${retired.length} old file(s) removed.`);
}

main().catch((error) => {
  console.error("Failed:", error.message);
  process.exitCode = 1;
});
