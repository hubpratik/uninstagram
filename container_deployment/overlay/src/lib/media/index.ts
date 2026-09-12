import type { MediaAsset } from "@/lib/types";
import { localMedia } from "./localMedia";
import { blobMedia } from "./blobMedia";

export type SaveOptions = {
  /** Crop to a square (used for the profile photo). */
  square?: boolean;
  /** Text burned into the bottom-right corner. Omit to leave the image clean. */
  watermark?: string;
  /** White frame burned around the photo, as a percentage of its longest edge. */
  border?: number;
};

/**
 * Where the actual bytes live. Selected by UNINSTAGRAM_STORE so the same image
 * can run against local disk (handy for a smoke test) or Azure Blob Storage.
 */
export interface MediaStore {
  save(buffer: Buffer, options?: SaveOptions): Promise<MediaAsset>;
  read(key: string): Promise<{ buffer: Buffer; mime: string } | null>;
  remove(keys: string[]): Promise<void>;
}

export const media: MediaStore =
  (process.env.UNINSTAGRAM_STORE ?? "json") === "azure" ? blobMedia : localMedia;

/**
 * What gets burned into uploaded photos. Override with UNINSTAGRAM_WATERMARK;
 * otherwise it follows whatever name is on the profile.
 */
export function watermarkFor(profileName: string): string {
  return process.env.UNINSTAGRAM_WATERMARK?.trim() || `© ${profileName}`;
}

const DEFAULT_BORDER_PERCENT = 2.2;

/**
 * How thick the white frame is, as a percentage of the photo's longest edge.
 * Set UNINSTAGRAM_BORDER_PERCENT to 0 to turn the frame off.
 */
export function borderPercent(): number {
  const raw = process.env.UNINSTAGRAM_BORDER_PERCENT?.trim();
  if (raw === undefined || raw === "") return DEFAULT_BORDER_PERCENT;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return DEFAULT_BORDER_PERCENT;
  return Math.min(value, 15);
}
