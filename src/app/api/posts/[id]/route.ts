import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { media } from "@/lib/media";
import { store } from "@/lib/store";
import { isValidMemoryDate } from "@/lib/format";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    caption?: string;
    location?: string;
    commentsDisabled?: boolean;
    takenAt?: string;
  };

  if (body.takenAt !== undefined && !isValidMemoryDate(body.takenAt)) {
    return NextResponse.json({ error: "That is not a valid date." }, { status: 400 });
  }

  const post = await store.updatePost(id, {
    ...(body.caption !== undefined ? { caption: body.caption.trim().slice(0, 2200) } : {}),
    ...(body.location !== undefined ? { location: body.location.trim().slice(0, 80) } : {}),
    ...(body.commentsDisabled !== undefined ? { commentsDisabled: body.commentsDisabled } : {}),
    ...(body.takenAt !== undefined ? { takenAt: body.takenAt } : {}),
  });

  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  return NextResponse.json({ post });
}

export async function DELETE(_request: Request, { params }: Params) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const { id } = await params;
  const removed = await store.deletePost(id);
  if (!removed) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  await media.remove(removed.media.flatMap((asset) => [asset.key, asset.thumbKey]));
  return NextResponse.json({ ok: true });
}
