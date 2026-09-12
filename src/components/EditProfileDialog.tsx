"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "./Avatar";
import { CloseIcon } from "./Icons";
import type { Profile } from "@/lib/types";

export default function EditProfileDialog({
  profile,
  onClose,
}: {
  profile: Profile;
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    username: profile.username,
    displayName: profile.displayName,
    bio: profile.bio,
    link: profile.link,
  });
  const [avatar, setAvatar] = useState(profile.avatar);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function uploadAvatar(file: File) {
    const body = new FormData();
    body.append("file", file);
    const response = await fetch("/api/profile/avatar", { method: "POST", body });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "Could not update the photo.");
      return;
    }
    setAvatar((data.profile as Profile).avatar);
    router.refresh();
  }

  async function save() {
    setSaving(true);
    setError(null);
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "Could not save.");
      return;
    }
    router.refresh();
    onClose();
  }

  const field = "w-full rounded-md border border-line bg-bg px-3 py-2.5 text-sm outline-none focus:border-muted";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "var(--ig-scrim)" }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Edit profile"
    >
      <div className="pop-in w-full max-w-[480px] overflow-hidden rounded-xl bg-elevated">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-base font-semibold">Edit profile</h2>
          <button onClick={onClose} aria-label="Close">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-4">
          <div className="flex items-center gap-4 rounded-lg bg-button/60 p-3">
            <Avatar asset={avatar} name={form.displayName || form.username} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{form.username}</p>
              <button
                onClick={() => fileRef.current?.click()}
                className="text-sm font-semibold text-brand"
              >
                Change profile photo
              </button>
            </div>
          </div>

          <label className="mt-4 block">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Username</span>
            <input
              value={form.username}
              onChange={(event) => setForm({ ...form, username: event.target.value })}
              maxLength={30}
              className={`mt-1.5 ${field}`}
            />
          </label>

          <label className="mt-4 block">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Name</span>
            <input
              value={form.displayName}
              onChange={(event) => setForm({ ...form, displayName: event.target.value })}
              maxLength={60}
              className={`mt-1.5 ${field}`}
            />
          </label>

          <label className="mt-4 block">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Bio</span>
            <textarea
              value={form.bio}
              onChange={(event) => setForm({ ...form, bio: event.target.value })}
              rows={3}
              maxLength={300}
              className={`mt-1.5 resize-none ${field}`}
            />
            <span className="mt-1 block text-right text-xs text-muted">{form.bio.length}/300</span>
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Link</span>
            <input
              value={form.link}
              onChange={(event) => setForm({ ...form, link: event.target.value })}
              placeholder="https://"
              maxLength={200}
              className={`mt-1.5 ${field}`}
            />
          </label>

          {error && <p className="mt-3 text-sm text-heart">{error}</p>}

          <button
            onClick={save}
            disabled={saving}
            className="mt-5 w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadAvatar(file);
            event.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
