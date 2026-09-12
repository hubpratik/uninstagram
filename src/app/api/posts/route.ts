import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { borderPercent, media, watermarkFor } from "@/lib/media";
import { store } from "@/lib/store";
import { isValidMemoryDate } from "@/lib/format";
import type { MediaAsset, Post } from "@/lib/types";

const MAX_FILES = 10;
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const form = await request.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

  if (files.length === 0) {
    return NextResponse.json({ error: "Pick at least one photo." }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Up to ${MAX_FILES} photos per post.` }, { status: 400 });
  }
  for (const file of files) {
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `${file.name} is larger than 25 MB.` }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: `${file.name} is not an image.` }, { status: 400 });
    }
  }

  const takenAt = String(form.get("takenAt") ?? "").trim();
  if (!isValidMemoryDate(takenAt)) {
    return NextResponse.json({ error: "Pick the date this was taken." }, { status: 400 });
  }
  // One day of slack so a traveller ahead of the server clock is not blocked.
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  if (takenAt > tomorrow) {
    return NextResponse.json({ error: "That date is in the future." }, { status: 400 });
  }

  const profile = await store.getProfile();
  const watermark = watermarkFor(profile.displayName || profile.username);
  const border = borderPercent();

  const assets: MediaAsset[] = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    assets.push(await media.save(buffer, { watermark, border }));
  }

  const now = new Date().toISOString();
  const post: Post = {
    id: randomUUID(),
    media: assets,
    caption: String(form.get("caption") ?? "").trim().slice(0, 2200),
    location: String(form.get("location") ?? "").trim().slice(0, 80),
    commentsDisabled: form.get("commentsDisabled") === "true",
    takenAt,
    createdAt: now,
    updatedAt: now,
  };

  await store.createPost(post);
  return NextResponse.json({ post }, { status: 201 });
}
