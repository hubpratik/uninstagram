import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { media } from "@/lib/media";
import { store } from "@/lib/store";

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Pick an image." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "That file is not an image." }, { status: 400 });
  }

  const previous = (await store.getProfile()).avatar;
  const asset = await media.save(Buffer.from(await file.arrayBuffer()), { square: true });
  const profile = await store.saveProfile({ avatar: asset });

  if (previous) await media.remove([previous.key, previous.thumbKey]);
  return NextResponse.json({ profile });
}
