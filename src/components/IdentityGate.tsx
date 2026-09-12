"use client";

import { useEffect, useRef, useState } from "react";
import Avatar from "./Avatar";
import AnimalAvatar from "./AnimalAvatar";
import { ANIMALS } from "@/lib/animals";
import type { VisitorIdentity } from "./IdentityProvider";

type Mode = "new" | "returning" | "reveal" | "forgot";

export default function IdentityGate({
  ownerName,
  reason,
  existing,
  onCancel,
  onSaved,
}: {
  ownerName: string;
  reason?: string;
  existing: VisitorIdentity | null;
  onCancel: () => void;
  onSaved: (visitor: VisitorIdentity) => void;
}) {
  const [mode, setMode] = useState<Mode>("new");
  const [nickname, setNickname] = useState(existing?.nickname ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [code, setCode] = useState("");
  const [issued, setIssued] = useState<VisitorIdentity | null>(null);
  const [requested, setRequested] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [icon, setIcon] = useState<Pick<VisitorIdentity, "avatar" | "animal">>({
    avatar: existing?.avatar ?? null,
    animal: existing?.animal ?? "",
  });
  const firstField = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  async function saveIcon(body: FormData) {
    setError(null);
    const response = await fetch("/api/visitors/avatar", { method: "POST", body });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "Could not update your icon.");
      return;
    }
    const saved = data.visitor as VisitorIdentity;
    setIcon({ avatar: saved.avatar, animal: saved.animal });
  }

  function chooseAnimal(animal: string) {
    const body = new FormData();
    body.append("animal", animal);
    void saveIcon(body);
  }

  function uploadPhoto(file: File) {
    const body = new FormData();
    body.append("file", file);
    void saveIcon(body);
  }

  useEffect(() => {
    firstField.current?.focus();
  }, [mode]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Escape during the reveal would lose the code, so make them acknowledge it.
      if (event.key === "Escape" && mode !== "reveal") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel, mode]);

  const field =
    "mt-1.5 w-full rounded-md border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-muted";

  async function submitNew(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const response = await fetch("/api/visitors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname, email }),
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);

    if (!response.ok) {
      setError(data.error ?? "Something went wrong. Try again?");
      return;
    }

    const visitor = data.visitor as VisitorIdentity;
    // Editing your own name, or coming back on a device that already knows you,
    // does not need the code ceremony again.
    if (existing || !data.isNew) {
      onSaved(visitor);
      return;
    }
    setIssued(visitor);
    setMode("reveal");
  }

  async function submitReturning(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const response = await fetch("/api/visitors/return", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname, code }),
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);

    if (!response.ok) {
      setError(data.error ?? "That did not work.");
      return;
    }
    onSaved(data.visitor as VisitorIdentity);
  }

  async function submitForgot(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const response = await fetch("/api/visitors/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname, email }),
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);

    if (!response.ok) {
      setError(data.error ?? "Could not send that request.");
      return;
    }
    setRequested(true);
  }

  async function copyCode() {
    if (!issued?.code) return;
    try {
      await navigator.clipboard.writeText(issued.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* Clipboard can be blocked; the code is on screen either way. */
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "var(--ig-scrim)" }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && mode !== "reveal") onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="identity-gate-title"
    >
      <div className="pop-in w-full max-w-[400px] overflow-hidden rounded-xl bg-elevated shadow-2xl">
        {mode === "reveal" && issued ? (
          <div className="px-6 pb-6 pt-6 text-center">
            <h2 id="identity-gate-title" className="text-lg font-semibold">
              You are in, {issued.nickname}
            </h2>
            {/* This is the one screen a visitor cannot get back to, so the
                instruction is stated plainly and given real visual weight
                rather than sitting in muted grey like everything else. */}
            <p className="mt-2 text-base font-bold text-ink">
              Save this code somewhere safe.
            </p>
            <p className="mt-1 text-sm font-semibold text-heart">
              You will need it to visit again.
            </p>

            <div className="my-5 rounded-xl border-2 border-dashed border-line bg-button/60 px-4 py-5">
              <p className="font-mono text-4xl font-semibold tracking-[0.3em] tabular-nums">
                {issued.code}
              </p>
            </div>

            <p className="text-sm text-muted">
              On a new phone or browser, enter your nickname and this code to come back as
              yourself, with your likes and comments still attached.
            </p>

            <button
              onClick={copyCode}
              className="mt-4 w-full rounded-lg bg-button py-2.5 text-sm font-semibold transition hover:bg-button-hover"
            >
              {copied ? "Copied" : "Copy code"}
            </button>
            <button
              onClick={() => onSaved(issued)}
              className="mt-2 w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-white transition hover:bg-brand-hover"
            >
              Got it
            </button>
          </div>
        ) : mode === "returning" ? (
          <>
            <div className="px-6 pt-6 pb-2 text-center">
              <h2 id="identity-gate-title" className="text-lg font-semibold">
                Welcome back
              </h2>
              <p className="mt-1 text-sm text-muted">
                Your nickname and the 5-digit code you were given.
              </p>
            </div>

            <form onSubmit={submitReturning} className="px-6 pb-6 pt-3">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Nickname
                </span>
                <input
                  ref={firstField}
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  maxLength={40}
                  className={field}
                />
              </label>

              <label className="mt-4 block">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Your code
                </span>
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 5))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="12345"
                  className={`${field} font-mono text-lg tracking-[0.3em]`}
                />
              </label>

              {error && <p className="mt-3 text-sm text-heart">{error}</p>}

              <button
                type="submit"
                disabled={saving || nickname.trim().length < 2 || code.length !== 5}
                className="mt-5 w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-40"
              >
                {saving ? "Checking…" : "Let me back in"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("forgot");
                  setError(null);
                  setRequested(false);
                }}
                className="mt-3 w-full py-1 text-sm font-semibold text-brand"
              >
                Forgot code? Request {ownerName} for a new one
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("new");
                  setError(null);
                }}
                className="mt-1 w-full py-2 text-sm font-semibold text-muted hover:text-ink"
              >
                First time here? Sign the guest book
              </button>
            </form>
          </>
        ) : mode === "forgot" ? (
          requested ? (
            <div className="px-6 pb-6 pt-6 text-center">
              <h2 id="identity-gate-title" className="text-lg font-semibold">
                Request sent
              </h2>
              <p className="mt-2 text-sm text-muted">
                {ownerName} will see it and send a new code to <strong>{email}</strong>. Come
                back and use it with your nickname once it arrives.
              </p>
              <button
                onClick={onCancel}
                className="mt-5 w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-white transition hover:bg-brand-hover"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              <div className="px-6 pt-6 pb-2 text-center">
                <h2 id="identity-gate-title" className="text-lg font-semibold">
                  Lost your code?
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {ownerName} will issue you a new one.
                </p>
              </div>

              <form onSubmit={submitForgot} className="px-6 pb-6 pt-3">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Nickname
                  </span>
                  <input
                    ref={firstField}
                    value={nickname}
                    onChange={(event) => setNickname(event.target.value)}
                    maxLength={40}
                    placeholder="The name you used before"
                    className={field}
                  />
                </label>

                <label className="mt-4 block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Email <span className="normal-case font-normal">(required)</span>
                  </span>
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    type="email"
                    maxLength={120}
                    placeholder="you@example.com"
                    className={field}
                  />
                  <span className="mt-1.5 block text-xs text-muted">
                    {ownerName} needs your email address to send you the new access code. It is
                    not used for anything else.
                  </span>
                </label>

                {error && <p className="mt-3 text-sm text-heart">{error}</p>}

                <button
                  type="submit"
                  disabled={saving || nickname.trim().length < 2 || !email.trim()}
                  className="mt-5 w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-40"
                >
                  {saving ? "Sending…" : "Request a new code"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("returning");
                    setError(null);
                  }}
                  className="mt-2 w-full py-2 text-sm font-semibold text-muted hover:text-ink"
                >
                  Back
                </button>
              </form>
            </>
          )
        ) : (
          <>
            <div className="px-6 pt-6 pb-2 text-center">
              <h2 id="identity-gate-title" className="text-lg font-semibold">
                {existing ? "Update your name" : "Before you come in"}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {reason ?? `No account needed. ${ownerName} just likes knowing who stopped by.`}
              </p>
            </div>

            <form onSubmit={submitNew} className="px-6 pb-6 pt-3">
              <label className="block">
                <span className="text-xs font-semibold tracking-wide text-muted uppercase">
                  Nickname
                </span>
                <input
                  ref={firstField}
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  maxLength={40}
                  placeholder="What should I call you?"
                  className={field}
                />
                <span className="mt-1.5 block text-xs text-muted">
                  So {ownerName} can put a face to the person.
                </span>
              </label>

              <label className="mt-4 block">
                <span className="text-xs font-semibold tracking-wide text-muted uppercase">
                  Email <span className="normal-case font-normal">(optional)</span>
                </span>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  maxLength={120}
                  placeholder="you@example.com"
                  className={field}
                />
                <span className="mt-1.5 block text-xs text-muted">
                  If you would like an email when {ownerName} uploads something new, leave it
                  here. Otherwise just leave it blank.
                </span>
              </label>

              {existing && (
                <div className="mt-4 rounded-lg bg-button/50 p-3">
                  <div className="flex items-center gap-3">
                    <Avatar
                      asset={icon.avatar}
                      animal={icon.animal}
                      name={nickname || "you"}
                      size="lg"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                        Your icon
                      </p>
                      <button
                        type="button"
                        onClick={() => photoInput.current?.click()}
                        className="text-sm font-semibold text-brand"
                      >
                        {icon.avatar ? "Change photo" : "Upload a photo"}
                      </button>
                    </div>
                  </div>

                  <p className="mt-3 text-xs text-muted">Or pick an animal:</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {ANIMALS.map((animal) => {
                      const active = !icon.avatar && icon.animal === animal.key;
                      return (
                        <button
                          key={animal.key}
                          type="button"
                          onClick={() => chooseAnimal(animal.key)}
                          title={animal.label}
                          aria-label={animal.label}
                          aria-pressed={active}
                          className={`h-9 w-9 overflow-hidden rounded-full transition ${
                            active ? "ring-2 ring-brand" : "opacity-70 hover:opacity-100"
                          }`}
                        >
                          <AnimalAvatar animal={animal.key} seed={animal.key} />
                        </button>
                      );
                    })}
                  </div>

                  <input
                    ref={photoInput}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) uploadPhoto(file);
                      event.target.value = "";
                    }}
                  />
                </div>
              )}

              {existing?.code && (
                <p className="mt-4 rounded-md bg-button/60 px-3 py-2.5 text-xs text-muted">
                  Your code is{" "}
                  <span className="font-mono text-sm font-semibold tracking-widest text-ink">
                    {existing.code}
                  </span>
                  . Use it with your nickname to get back in on another device.
                </p>
              )}

              {error && <p className="mt-3 text-sm text-heart">{error}</p>}

              <button
                type="submit"
                disabled={saving || nickname.trim().length < 2}
                className="mt-5 w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-40"
              >
                {saving ? "One moment…" : existing ? "Save" : "Come on in"}
              </button>

              {!existing && (
                <button
                  type="button"
                  onClick={() => {
                    setMode("returning");
                    setError(null);
                    setCode("");
                  }}
                  className="mt-2 w-full py-2 text-sm font-semibold text-brand"
                >
                  Been here before? Use your code
                </button>
              )}

              <button
                type="button"
                onClick={onCancel}
                className="mt-1 w-full py-2 text-sm font-semibold text-muted hover:text-ink"
              >
                {existing ? "Cancel" : "Just browsing, thanks"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
