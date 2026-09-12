import { NextResponse } from "next/server";
import { ADMIN_COOKIE, checkAdminCode, issueAdminToken } from "@/lib/admin";

export async function POST(request: Request) {
  const { code } = (await request.json().catch(() => ({}))) as { code?: string };
  if (!code || !checkAdminCode(code)) {
    return NextResponse.json({ error: "That code did not match." }, { status: 401 });
  }

  const token = issueAdminToken();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, token.value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: token.maxAge,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
