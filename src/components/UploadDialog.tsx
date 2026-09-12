"use client";

import { useEffect, useRef, useState } from "react";
import Avatar from "./Avatar";
import { CameraIcon, CloseIcon } from "./Icons";
import { todayAsDateInput } from "@/lib/format";
import type { Profile } from "@/lib/types";

type Picked = { file: File; url: string };

export default function UploadDialog({
  profile,
  onClose,
  onDone,
}: {
  profile: Profile;
  onClose: () => void;
  onDone: () => void;
}) {
  const [picked, setPicked] = useState<Picked[]>([]);
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const [takenAt, setTakenAt] = useState(todayAsDateInput());
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !uploading) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, uploading]);

  // Revoke the object URLs when this dialog goes away.
  useEffect(() => {
    return () => picked.forEach((item) => URL.revokeObjectURL(item.url));
  }, [picked]);

  function add(files: FileList | null) {
    if (!files) return;
    const images = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) {
      setError("Those need to be image files.");
      return;
    }
    setError(null);
    setPicked((current) =>
      [...current, ...images.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, 10),
    );
  }

  function removeAt(index: number) {
    setPicked((current) => {
      URL.revokeObjectURL(current[index].url);
      return current.filter((_, i) => i !== index);
    });
  }

  async function share() {
    if (picked.length === 0) return;
    if (!takenAt) {
      setError("Add the date this was taken.");
      return;
    }
    setUploading(true);
    setError(null);

    const form = new FormData();
    picked.forEach((item) => form.append("files", item.file));
    form.append("caption", caption);
    form.append("location", location);
    form.append("takenAt", takenAt);

    const response = await fetch("/api/posts", { method: "POST", body: form });
    setUploading(false);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "Upload failed. Try again?");
      return;
    }
    onDone();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-0 md:p-8"
      style={{ background: "var(--ig-scrim)" }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !uploading) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Create new post"
    >
      <button
        onClick={onClose}
        disabled={uploading}
        aria-label="Close"
        className="fixed right-3 top-3 z-[105] text-white transition hover:opacity-70 md:right-5 md:top-5"
      >
        <CloseIcon className="h-7 w-7" />
      </button>

      <div className="pop-in flex h-full w-full flex-col overflow-hidden bg-elevated md:h-[min(86vh,720px)] md:w-[min(96vw,1000px)] md:rounded-xl">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <button
            onClick={() => (picked.length ? setPicked([]) : onClose())}
            className="text-sm font-semibold"
          >
            {picked.length ? "Back" : "Cancel"}
          </button>
          <h2 className="text-base font-semibold">Create new post</h2>
          <button
            onClick={share}
            disabled={picked.length === 0 || !takenAt || uploading}
            className="text-sm font-semibold text-brand disabled:opacity-40"
          >
            {uploading ? "Sharing…" : "Share"}
          </button>
        </div>

        {picked.length === 0 ? (
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              add(event.dataTransfer.files);
            }}
            className={`flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center transition ${
              dragging ? "bg-button" : ""
            }`}
          >
            <CameraIcon className="h-16 w-16 text-ink" strokeWidth={1} />
            <p className="text-xl font-light">Drag photos here</p>
            <button
              onClick={() => inputRef.current?.click()}
              className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-hover"
            >
              Select from computer
            </button>
            <p className="text-xs text-muted">
              Up to 10 photos per post, 25 MB each. Each one gets your watermark.
            </p>
            {error && <p className="text-sm text-heart">{error}</p>}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-3">
              <div className="no-scrollbar flex h-full w-full snap-x snap-mandatory gap-3 overflow-x-auto">
                {picked.map((item, index) => (
                  <div
                    key={item.url}
                    className="relative flex h-full w-full shrink-0 snap-center items-center justify-center"
                  >
                    <img src={item.url} alt="" className="max-h-full max-w-full object-contain" />
                    <button
                      onClick={() => removeAt(index)}
                      aria-label="Remove photo"
                      className="absolute right-2 top-2 rounded-full bg-black/70 p-1.5 text-white"
                    >
                      <CloseIcon className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex w-full shrink-0 flex-col border-t border-line p-4 md:w-[340px] md:border-l md:border-t-0">
              <div className="flex items-center gap-3">
                <Avatar asset={profile.avatar} name={profile.displayName || profile.username} size="md" />
                <span className="text-sm font-semibold">{profile.username}</span>
              </div>

              <textarea
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                rows={6}
                maxLength={2200}
                placeholder="Write a caption…"
                className="mt-3 w-full flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted"
              />
              <p className="text-right text-xs text-muted">{caption.length}/2,200</p>

              <label className="mt-2 block border-t border-line pt-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  When was this taken?
                </span>
                <input
                  type="date"
                  value={takenAt}
                  max={todayAsDateInput()}
                  onChange={(event) => setTakenAt(event.target.value)}
                  required
                  className="mt-1.5 w-full rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-muted"
                />
                <span className="mt-1.5 block text-xs text-muted">
                  The date of the memory, not of the upload. This is the date people see.
                </span>
              </label>

              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                maxLength={80}
                placeholder="Add location"
                className="mt-3 w-full border-y border-line bg-transparent py-3 text-sm outline-none placeholder:text-muted"
              />

              <button
                onClick={() => inputRef.current?.click()}
                className="mt-3 text-left text-sm font-semibold text-brand"
              >
                Add more photos
              </button>

              {error && <p className="mt-2 text-sm text-heart">{error}</p>}

              <button
                onClick={share}
                disabled={uploading}
                className="mt-3 rounded-lg bg-brand py-2 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-50 md:hidden"
              >
                {uploading ? "Sharing…" : "Share"}
              </button>
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            add(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
