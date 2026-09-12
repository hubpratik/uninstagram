"use client";

import { useEffect, useState } from "react";
import Avatar from "./Avatar";
import { CloseIcon } from "./Icons";
import { timeAgo } from "@/lib/format";
import { useIdentity } from "./IdentityProvider";
import type { PublicVisitor } from "@/lib/types";

export default function VisitorsDialog({ onClose }: { onClose: () => void }) {
  const { visitor: me, isAdmin } = useIdentity();
  const [visitors, setVisitors] = useState<PublicVisitor[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let live = true;
    fetch("/api/visitors")
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!live) return;
        if (!response.ok) {
          setError("Could not load the list.");
          return;
        }
        setVisitors(data.visitors as PublicVisitor[]);
      })
      .catch(() => live && setError("Could not load the list."));
    return () => {
      live = false;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "var(--ig-scrim)" }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="visitors-title"
    >
      <div className="pop-in flex max-h-[min(80vh,600px)] w-full max-w-[400px] flex-col overflow-hidden rounded-xl bg-elevated">
        <div className="relative flex items-center justify-center border-b border-line px-4 py-3">
          <h2 id="visitors-title" className="text-base font-semibold">
            Visitors
          </h2>
          <button onClick={onClose} aria-label="Close" className="absolute right-4">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {visitors === null && !error && (
            <p className="px-4 py-10 text-center text-sm text-muted">Loading…</p>
          )}

          {error && <p className="px-4 py-10 text-center text-sm text-heart">{error}</p>}

          {visitors?.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-muted">
              Nobody has left their name yet.
            </p>
          )}

          {visitors?.map((visitor) => (
            <div key={visitor.id} className="flex items-center gap-3 px-4 py-2.5">
              <Avatar
                asset={visitor.avatar}
                animal={visitor.animal}
                name={visitor.nickname}
                size="lg"
              />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-sm font-semibold">
                  {visitor.nickname}
                  {visitor.id === me?.id && <span className="text-muted"> · you</span>}
                </p>
                <p className="truncate text-xs text-muted">
                  {/* Emails and codes only ever reach the owner; the API withholds
                      them from everyone else. */}
                  {isAdmin && visitor.email
                    ? visitor.email
                    : `Last here ${timeAgo(visitor.lastSeenAt)}`}
                </p>
              </div>
              {isAdmin && visitor.code && (
                <span className="shrink-0 font-mono text-xs tracking-widest text-muted">
                  {visitor.code}
                </span>
              )}
            </div>
          ))}
        </div>

        <p className="border-t border-line px-4 py-3 text-center text-xs text-muted">
          Everyone who left a nickname. Email addresses stay private.
        </p>
      </div>
    </div>
  );
}
