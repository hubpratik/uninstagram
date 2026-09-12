import { NextResponse } from "next/server";
import { media } from "@/lib/media";
import { store } from "@/lib/store";
import { currentVisitor } from "@/lib/visitor";
import { isAnimalKey } from "@/lib/animals";

/** Set a visitor's own picture, or swap which animal stands in for them. */
export async function POST(request: Request) {
  const visitor = await currentVisitor();
  if (!visitor) {
    return NextResponse.json({ error: "identity_required" }, { status: 401 });
  }

  const form = await request.formData();
  const animal = form.get("animal");

  // Picking an animal clears any uploaded photo, and vice versa.
  if (typeof animal === "string" && animal) {
    if (!isAnimalKey(animal)) {
      return NextResponse.json({ error: "Unknown icon." }, { status: 400 });
    }
    const previous = visitor.avatar;
    const saved = await store.upsertVisitor({ ...visitor, avatar: null, animal });
    if (previous) await media.remove([previous.key, previous.thumbKey]);
    return NextResponse.json({ visitor: saved });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Pick an image." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "That file is not an image." }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Keep it under 10 MB." }, { status: 400 });
  }

  const previous = visitor.avatar;
  // No watermark here — it is their face, not the owner's photograph.
  const asset = await media.save(Buffer.from(await file.arrayBuffer()), { square: true });
  const saved = await store.upsertVisitor({ ...visitor, avatar: asset });

  if (previous) await media.remove([previous.key, previous.thumbKey]);
  return NextResponse.json({ visitor: saved });
}
