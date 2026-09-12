import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdmin } from "@/lib/admin";
import { store } from "@/lib/store";
import { VISITOR_COOKIE, VISITOR_COOKIE_MAX_AGE, currentVisitorId } from "@/lib/visitor";
import type { PublicVisitor, Visitor } from "@/lib/types";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The guest book. Anyone who has left a nickname can see who else stopped by —
 * names only. Emails and pass codes are the owner's business and never leave
 * this handler for anyone else.
 */
export async function GET() {
  const admin = await isAdmin();
  const identified = admin || (await currentVisitorId()) !== null;
  if (!identified) {
    return NextResponse.json({ error: "identity_required" }, { status: 401 });
  }

  const visitors = await store.listVisitors();
  const payload: PublicVisitor[] = visitors.map((visitor) => ({
    id: visitor.id,
    nickname: visitor.nickname,
    lastSeenAt: visitor.lastSeenAt,
    avatar: visitor.avatar ?? null,
    animal: visitor.animal,
    ...(admin && visitor.email ? { email: visitor.email } : {}),
    ...(admin ? { code: visitor.code } : {}),
  }));

  return NextResponse.json({ visitors: payload });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    nickname?: string;
    email?: string;
  };

  const nickname = (body.nickname ?? "").trim().slice(0, 40);
  const email = (body.email ?? "").trim().slice(0, 120);

  if (nickname.length < 2) {
    return NextResponse.json({ error: "Please enter a nickname." }, { status: 400 });
  }
  if (email && !EMAIL.test(email)) {
    return NextResponse.json({ error: "That email does not look right." }, { status: 400 });
  }

  const jar = await cookies();
  const existingId = jar.get(VISITOR_COOKIE)?.value;
  const existing = existingId ? await store.getVisitor(existingId) : null;
  const now = new Date().toISOString();

  const visitor: Visitor = {
    id: existing?.id ?? randomUUID(),
    nickname,
    email,
    // Blank means "mint me one"; a returning visitor keeps what they have.
    code: existing?.code ?? "",
    avatar: existing?.avatar ?? null,
    animal: existing?.animal ?? "",
    codeResetRequestedAt: existing?.codeResetRequestedAt ?? "",
    codeResetEmail: existing?.codeResetEmail ?? "",
    notify: Boolean(email),
    firstSeenAt: existing?.firstSeenAt ?? now,
    lastSeenAt: now,
  };

  const saved = await store.upsertVisitor(visitor);

  const response = NextResponse.json({ visitor: saved, isNew: !existing });
  response.cookies.set(VISITOR_COOKIE, saved.id, {
    sameSite: "lax",
    path: "/",
    maxAge: VISITOR_COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
