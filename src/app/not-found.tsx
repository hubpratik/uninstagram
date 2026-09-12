import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
      <h1 className="text-2xl font-bold">This page is not available.</h1>
      <p className="max-w-sm text-sm text-muted">
        The link may be broken, or the photo may have been removed.
      </p>
      <Link href="/" className="mt-2 text-sm font-semibold text-brand">
        Go back to Uninstagram
      </Link>
    </div>
  );
}
