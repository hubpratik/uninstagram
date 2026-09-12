import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { VISITOR_COOKIE, VISITOR_COOKIE_MAX_AGE } from "@/lib/visitor";
import { callerKey, clearFailures, isLockedOut, recordFailure } from "@/lib/rateLimit";

const CODE = /^\d{5}$/;

/** "I have been here before" — nickname plus pass code, and you are you again. */
export async function POST(request: Request) {
  const key = callerKey(request);
  if (isLockedOut(key)) {
    return NextResponse.json(
      { error: "Too many tries. Give it ten minutes, or just pick a new nickname." },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    nickname?: string;
    code?: string;
  };

  const nickname = (body.nickname ?? "").trim();
  const code = (body.code ?? "").trim();

  if (!nickname || !CODE.test(code)) {
    recordFailure(key);
    return NextResponse.json(
      { error: "Enter your nickname and your 5-digit code." },
      { status: 400 },
    );
  }

  const visitor = await store.findVisitorByCode(nickname, code);
  if (!visitor) {
    recordFailure(key);
    return NextResponse.json(
      { error: "That nickname and code do not match." },
      { status: 401 },
    );
  }

  clearFailures(key);
  const saved = await store.upsertVisitor({ ...visitor, lastSeenAt: new Date().toISOString() });

  const response = NextResponse.json({ visitor: saved });
  response.cookies.set(VISITOR_COOKIE, saved.id, {
    sameSite: "lax",
    path: "/",
    maxAge: VISITOR_COOKIE_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
