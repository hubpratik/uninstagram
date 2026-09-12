/**
 * Client-safe: turns a stored media key into the URL that serves it.
 * Kept out of lib/media so components never pull sharp into the browser bundle.
 */
export function mediaUrl(key: string): string {
  return `/api/media/${key}`;
}
