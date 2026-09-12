import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "uninstagram_admin";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function secret(): string {
  return process.env.UNINSTAGRAM_SECRET ?? "uninstagram-dev-secret";
}

function sign(expiresAt: number): string {
  return createHmac("sha256", secret()).update(`admin:${expiresAt}`).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function issueAdminToken(): { value: string; maxAge: number } {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  return { value: `${expiresAt}.${sign(expiresAt)}`, maxAge: MAX_AGE_SECONDS };
}

export function verifyAdminToken(token: string | undefined): boolean {
  if (!token) return false;
  const [rawExpiry, signature] = token.split(".");
  const expiresAt = Number(rawExpiry);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now() || !signature) return false;
  return safeEqual(signature, sign(expiresAt));
}

export function checkAdminCode(code: string): boolean {
  const expected = process.env.UNINSTAGRAM_ADMIN_CODE;
  if (!expected) return false;
  return safeEqual(code, expected);
}

/** Server-side: is the current request coming from the account owner? */
export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return verifyAdminToken(jar.get(ADMIN_COOKIE)?.value);
}
