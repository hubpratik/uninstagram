"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockIcon } from "./Icons";

export default function AdminUnlock() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const response = await fetch("/api/admin/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    setBusy(false);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "That did not work.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-[380px] px-4 py-16">
      <form onSubmit={submit} className="rounded-xl border border-line p-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-button">
          <LockIcon />
        </span>
        <h1 className="mt-4 font-logo text-3xl leading-none">
          <span className="wordmark-un">Un</span>instagram
        </h1>
        <p className="mt-2 text-sm text-muted">Owner access. Everyone else can just enjoy the photos.</p>

        <input
          type="password"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Admin code"
          autoFocus
          className="mt-6 w-full rounded-md border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-muted"
        />

        {error && <p className="mt-3 text-sm text-heart">{error}</p>}

        <button
          type="submit"
          disabled={busy || !code}
          className="mt-4 w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-40"
        >
          {busy ? "Checking…" : "Unlock"}
        </button>
        <p className="mt-4 text-xs text-muted">
          The code lives in <code>.env.local</code> as <code>UNINSTAGRAM_ADMIN_CODE</code>.
        </p>
      </form>
    </div>
  );
}
