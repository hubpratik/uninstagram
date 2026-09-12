import { NextResponse } from "next/server";
import { media } from "@/lib/media";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const file = await media.read(key);
  if (!file) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(file.buffer.byteLength),
      // Keys are content-addressed (a new upload gets a new uuid), so these
      // are safe to cache hard.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
