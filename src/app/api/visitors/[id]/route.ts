import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { media } from "@/lib/media";
import { store } from "@/lib/store";

/** Remove a visitor, their comments, their likes and any photo they uploaded. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const { id } = await params;
  const removed = await store.deleteVisitor(id);
  if (!removed) return NextResponse.json({ error: "Visitor not found" }, { status: 404 });

  // Their avatar would otherwise sit in storage forever, paid for and unreachable.
  if (removed.avatar) {
    await media.remove([removed.avatar.key, removed.avatar.thumbKey]);
  }

  return NextResponse.json({ ok: true, nickname: removed.nickname });
}
