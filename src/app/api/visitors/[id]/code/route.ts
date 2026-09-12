import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { store } from "@/lib/store";

/**
 * Issue a fresh pass code for a visitor and clear their pending request.
 * The new code is returned so the owner can copy it and send it on by hand —
 * this app sends no email itself.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const { id } = await params;
  const visitor = await store.regenerateCode(id);
  if (!visitor) return NextResponse.json({ error: "Visitor not found" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    nickname: visitor.nickname,
    code: visitor.code,
  });
}
