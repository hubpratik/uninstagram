import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { store } from "@/lib/store";
import { currentVisitorId } from "@/lib/visitor";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const admin = await isAdmin();
  const visitorId = await currentVisitorId();

  if (!admin) {
    // Visitors may remove their own comment, nothing else.
    const comment = (await store.listComments()).find((c) => c.id === id);
    if (!comment || !visitorId || comment.visitorId !== visitorId) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
  }

  const removed = await store.deleteComment(id);
  if (!removed) return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
