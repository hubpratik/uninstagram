import { cookies } from "next/headers";
import { store } from "@/lib/store";
import type { Visitor } from "@/lib/types";

export const VISITOR_COOKIE = "uninstagram_visitor";
export const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Server-side: the identified visitor for this request, if they left a nickname. */
export async function currentVisitor(): Promise<Visitor | null> {
  const jar = await cookies();
  const id = jar.get(VISITOR_COOKIE)?.value;
  if (!id) return null;
  return store.getVisitor(id);
}

export async function currentVisitorId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(VISITOR_COOKIE)?.value ?? null;
}
