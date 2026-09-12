import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { callerKey, clearFailures, isLockedOut, recordFailure } from "@/lib/rateLimit";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "I lost my code." This grants nothing on its own — it only flags the visitor
 * so the owner sees the request in the manage page and can issue a new code by
 * hand. The supplied email is stored separately from the visitor's own address
 * precisely because anyone can claim to be anyone here; the owner needs to see
 * that a request for a given nickname arrived from an unfamiliar address.
 */
export async function POST(request: Request) {
  const key = callerKey(request);
  if (isLockedOut(key)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in ten minutes." },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    nickname?: string;
    email?: string;
  };

  const nickname = (body.nickname ?? "").trim().slice(0, 40);
  const email = (body.email ?? "").trim().slice(0, 120);

  if (nickname.length < 2) {
    recordFailure(key);
    return NextResponse.json({ error: "Enter the nickname you used." }, { status: 400 });
  }
  if (!EMAIL.test(email)) {
    recordFailure(key);
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const visitor = await store.requestCodeReset(nickname, email);
  if (!visitor) {
    recordFailure(key);
    return NextResponse.json(
      { error: "No one here goes by that nickname. Check the spelling?" },
      { status: 404 },
    );
  }

  clearFailures(key);
  return NextResponse.json({ ok: true, nickname: visitor.nickname });
}
