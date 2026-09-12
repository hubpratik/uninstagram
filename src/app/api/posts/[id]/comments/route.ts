import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { store } from "@/lib/store";
import { currentVisitor } from "@/lib/visitor";
import type { Comment } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  return NextResponse.json({ comments: await store.listComments(id) });
}

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;

  const post = await store.getPost(id);
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  if (post.commentsDisabled) {
    return NextResponse.json({ error: "Comments are turned off." }, { status: 403 });
  }

  const visitor = await currentVisitor();
  const admin = await isAdmin();
  const identity = visitor
    ? { id: visitor.id, nickname: visitor.nickname }
    : admin
      ? { id: "owner", nickname: (await store.getProfile()).username }
      : null;

  if (!identity) {
    return NextResponse.json({ error: "identity_required" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { text?: string };
  const text = (body.text ?? "").trim().slice(0, 1000);
  if (!text) return NextResponse.json({ error: "Say something first." }, { status: 400 });

  const comment: Comment = {
    id: randomUUID(),
    postId: id,
    visitorId: identity.id,
    nickname: identity.nickname,
    text,
    createdAt: new Date().toISOString(),
  };

  await store.addComment(comment);
  return NextResponse.json({ comment }, { status: 201 });
}
