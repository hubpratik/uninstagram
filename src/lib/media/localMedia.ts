import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp, { type Sharp } from "sharp";
import type { MediaAsset } from "@/lib/types";
import type { MediaStore, SaveOptions } from "./index";

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

const MAX_EDGE = 1440;
const THUMB_EDGE = 720;
const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (char) => {
    switch (char) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case '"':
        return "&quot;";
      default:
        return "&apos;";
    }
  });
}

/**
 * A full-size transparent overlay with the mark sitting in the bottom-right
 * corner. Sizing everything off the image width keeps the mark the same
 * relative weight on a thumbnail and on the full-size copy.
 */
function watermarkOverlay(text: string, width: number, height: number): Buffer {
  const fontSize = Math.max(11, Math.round(width * 0.032));
  const margin = Math.round(width * 0.028);
  const safe = escapeXml(text);

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="${Math.max(1, Math.round(fontSize * 0.06))}"
            stdDeviation="${Math.max(1, fontSize * 0.09)}" flood-color="#000" flood-opacity="0.55"/>
        </filter>
      </defs>
      <text x="${width - margin}" y="${height - margin}"
        text-anchor="end"
        font-family="Helvetica, Arial, sans-serif"
        font-size="${fontSize}"
        font-weight="600"
        letter-spacing="${(fontSize * 0.02).toFixed(2)}"
        fill="#ffffff"
        fill-opacity="0.88"
        filter="url(#shadow)">${safe}</text>
    </svg>`,
  );
}

async function render(
  pipeline: Sharp,
  { watermark, border = 0 }: { watermark?: string; border?: number },
): Promise<{ data: Buffer; width: number; height: number }> {
  const staged = await pipeline.toBuffer({ resolveWithObject: true });
  let width = staged.info.width;
  let height = staged.info.height;
  let data = staged.data;

  // The mark goes on after the resize so it is never scaled down with the photo,
  // and before the frame so it sits on the photograph rather than the border.
  if (watermark) {
    data = await sharp(data)
      .composite([{ input: watermarkOverlay(watermark, width, height), top: 0, left: 0 }])
      .toBuffer();
  }

  if (border > 0) {
    const edge = Math.max(2, Math.round((Math.max(width, height) * border) / 100));
    data = await sharp(data)
      .extend({
        top: edge,
        bottom: edge,
        left: edge,
        right: edge,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .toBuffer();
    width += edge * 2;
    height += edge * 2;
  }

  return { data: await sharp(data).webp({ quality: 86 }).toBuffer(), width, height };
}

export const localMedia: MediaStore = {
  async save(buffer, options: SaveOptions = {}) {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const id = randomUUID();

    // .rotate() with no argument applies the EXIF orientation, which phones
    // rely on; without it portrait shots come out sideways.
    const base = sharp(buffer, { failOn: "none" }).rotate();

    const full = await render(
      base
        .clone()
        .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true }),
      { watermark: options.watermark, border: options.border },
    );

    // No frame on the thumbnail: the grid crops tiles to squares, which would
    // slice a baked-in border unevenly. The frame belongs on the photo you open.
    const thumb = await render(
      base.clone().resize({
        width: THUMB_EDGE,
        height: THUMB_EDGE,
        fit: options.square ? "cover" : "inside",
        position: "attention",
        withoutEnlargement: true,
      }),
      { watermark: options.watermark },
    );

    const key = `${id}.webp`;
    const thumbKey = `${id}_t.webp`;
    await fs.writeFile(path.join(UPLOAD_DIR, key), full.data);
    await fs.writeFile(path.join(UPLOAD_DIR, thumbKey), thumb.data);

    return {
      key,
      thumbKey,
      width: full.width,
      height: full.height,
      mime: "image/webp",
      framed: (options.border ?? 0) > 0,
    } satisfies MediaAsset;
  },

  async read(key) {
    if (!SAFE_KEY.test(key)) return null;
    try {
      const buffer = await fs.readFile(path.join(UPLOAD_DIR, key));
      return { buffer, mime: "image/webp" };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  },

  async remove(keys) {
    await Promise.all(
      keys
        .filter((key) => SAFE_KEY.test(key))
        .map((key) => fs.rm(path.join(UPLOAD_DIR, key), { force: true })),
    );
  },
};
