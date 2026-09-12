/**
 * A deliberately small throttle for the "come back with my code" form.
 *
 * A 5-digit code is only 100,000 possibilities, which a script could walk
 * through in minutes if we let it. This caps failed guesses per caller so the
 * code stays a convenience without becoming a free pass into someone's
 * nickname.
 *
 * State lives in memory: it resets when the server restarts and is per-instance,
 * so if this is ever scaled to more than one Azure instance it wants moving to
 * Table Storage or Redis alongside the rest of the data.
 */

type Bucket = { failures: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const MAX_FAILURES = 10;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_BUCKETS = 10_000;

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/** Best-effort caller identity. Behind Azure App Service this is the real IP. */
export function callerKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim();
  return ip || request.headers.get("x-real-ip") || "unknown";
}

export function isLockedOut(key: string): boolean {
  const bucket = buckets.get(key);
  if (!bucket) return false;
  if (bucket.resetAt <= Date.now()) {
    buckets.delete(key);
    return false;
  }
  return bucket.failures >= MAX_FAILURES;
}

export function recordFailure(key: string): void {
  const now = Date.now();
  if (buckets.size > MAX_BUCKETS) sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { failures: 1, resetAt: now + WINDOW_MS });
    return;
  }
  bucket.failures += 1;
}

export function clearFailures(key: string): void {
  buckets.delete(key);
}
