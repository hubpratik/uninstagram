import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { store } from "@/lib/store";
import { currentVisitor } from "@/lib/visitor";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const post = await store.getPost(id);
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const visitor = await currentVisitor();
  const admin = await isAdmin();

  // The owner can like their own photos; everyone else needs a nickname first.
  const identity = visitor
    ? { id: visitor.id, nickname: visitor.nickname }
    : admin
      ? { id: "owner", nickname: (await store.getProfile()).username }
      : null;

  if (!identity) {
    return NextResponse.json({ error: "identity_required" }, { status: 401 });
  }

  const result = await store.toggleLike({
    postId: id,
    visitorId: identity.id,
    nickname: identity.nickname,
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json(result);
}
