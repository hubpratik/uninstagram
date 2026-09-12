import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { store } from "@/lib/store";

export async function GET() {
  return NextResponse.json({ profile: await store.getProfile() });
}

export async function PATCH(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as {
    username?: string;
    displayName?: string;
    bio?: string;
    link?: string;
  };

  const username =
    body.username === undefined
      ? undefined
      : body.username.trim().toLowerCase().replace(/\s+/g, "").slice(0, 30);

  const profile = await store.saveProfile({
    ...(username ? { username } : {}),
    ...(body.displayName !== undefined ? { displayName: body.displayName.trim().slice(0, 60) } : {}),
    ...(body.bio !== undefined ? { bio: body.bio.slice(0, 300) } : {}),
    ...(body.link !== undefined ? { link: body.link.trim().slice(0, 200) } : {}),
  });

  return NextResponse.json({ profile });
}
