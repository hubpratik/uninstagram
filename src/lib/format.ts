const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const UNITS: [limit: number, seconds: number, short: string, long: string][] = [
  [60, 1, "s", "second"],
  [3600, 60, "m", "minute"],
  [86400, 3600, "h", "hour"],
  [604800, 86400, "d", "day"],
  [2629800, 604800, "w", "week"],
];

/** Instagram-style relative stamps: "4h", "2 days ago". */
export function timeAgo(iso: string, style: "short" | "long" = "short"): string {
  const seconds = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
  for (const [limit, divisor, short, long] of UNITS) {
    if (seconds < limit) {
      const value = Math.floor(seconds / divisor);
      if (style === "short") return `${value}${short}`;
      return `${value} ${long}${value === 1 ? "" : "s"} ago`;
    }
  }
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  const stamp = `${MONTHS[date.getMonth()]} ${date.getDate()}`;
  return sameYear ? stamp : `${stamp}, ${date.getFullYear()}`;
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : pluralForm}`;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Today in the local timezone, as the YYYY-MM-DD the date input expects. */
export function todayAsDateInput(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function isValidMemoryDate(value: string): boolean {
  if (!DATE_ONLY.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  );
}

/**
 * "May 5, 2021". Formatted by hand rather than via toLocaleDateString: the
 * server's locale and the browser's are often different (en-US vs en-IN gives
 * "May 5, 2021" vs "5 May 2021"), and that mismatch breaks hydration. Parsed as
 * a plain calendar date, so the day never shifts across timezones either.
 */
export function memoryDate(value: string | undefined): string {
  if (!value) return "";
  if (!DATE_ONLY.test(value)) return timeAgo(value, "long");
  const [year, month, day] = value.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}
