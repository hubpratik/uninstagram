import { randomUUID } from "node:crypto";
import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import sharp, { type Sharp } from "sharp";
import type { MediaAsset } from "@/lib/types";
import type { MediaStore, SaveOptions } from "./index";

/**
 * Azure Blob Storage driver.
 *
 * NOTE ON DUPLICATION: the resize / watermark / frame pipeline below is a copy
 * of the one in localMedia.ts. It is duplicated on purpose — this file only
 * exists inside the container image, and the brief was to leave the dev tree
 * untouched so the local setup stays a working failsafe. When you are happy
 * that Container Apps is the permanent home, lift the pipeline into a shared
 * module (e.g. src/lib/media/pipeline.ts) and have both drivers import it.
 * Until then, any change to the look of an uploaded photo has to be made in
 * BOTH files.
 */

const MAX_EDGE = 1440;
const THUMB_EDGE = 720;
const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const CONNECTION = process.env.AZURE_STORAGE_CONNECTION_STRING ?? "";
const CONTAINER = process.env.AZURE_BLOB_CONTAINER ?? "media";

let containerPromise: Promise<ContainerClient> | null = null;

function container(): Promise<ContainerClient> {
  if (!CONNECTION) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is not set.");
  }
  if (!containerPromise) {
    containerPromise = (async () => {
      const service = BlobServiceClient.fromConnectionString(CONNECTION);
      const client = service.getContainerClient(CONTAINER);
      // Private by default: blobs are served through /api/media, never anonymously.
      await client.createIfNotExists();
      return client;
    })().catch((error) => {
      containerPromise = null;
      throw error;
    });
  }
  return containerPromise;
}

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

async function upload(key: string, data: Buffer): Promise<void> {
  const client = (await container()).getBlockBlobClient(key);
  await client.uploadData(data, {
    blobHTTPHeaders: {
      blobContentType: "image/webp",
      // Keys are freshly generated per upload, so these never change under a
      // given URL and are safe to cache hard.
      blobCacheControl: "public, max-age=31536000, immutable",
    },
  });
}

export const blobMedia: MediaStore = {
  async save(buffer, options: SaveOptions = {}) {
    const id = randomUUID();
    const base = sharp(buffer, { failOn: "none" }).rotate();

    const full = await render(
      base
        .clone()
        .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true }),
      { watermark: options.watermark, border: options.border },
    );

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
    await Promise.all([upload(key, full.data), upload(thumbKey, thumb.data)]);

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
      const client = (await container()).getBlockBlobClient(key);
      const buffer = await client.downloadToBuffer();
      return { buffer, mime: "image/webp" };
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404) return null;
      throw error;
    }
  },

  async remove(keys) {
    const client = await container();
    await Promise.all(
      keys
        .filter((key) => SAFE_KEY.test(key))
        .map((key) => client.getBlockBlobClient(key).deleteIfExists()),
    );
  },
};
