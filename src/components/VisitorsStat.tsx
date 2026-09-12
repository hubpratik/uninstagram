"use client";

import { useState } from "react";
import { useIdentity } from "./IdentityProvider";
import VisitorsDialog from "./VisitorsDialog";

/**
 * The "visitors" number on the profile, which opens into the list of who has
 * stopped by — a familiar followers dialog, minus the follower part.
 */
export default function VisitorsStat({
  count,
  layout,
}: {
  count: number;
  layout: "inline" | "stacked";
}) {
  const { ensureIdentity } = useIdentity();
  const [open, setOpen] = useState(false);

  async function show() {
    if (count === 0) return;
    // Same deal as opening a photo: say who you are, then see who else came.
    const ok = await ensureIdentity("Leave your name and you can see who else has been by.");
    if (ok) setOpen(true);
  }

  const label = count === 1 ? "visitor" : "visitors";

  return (
    <>
      <button
        onClick={show}
        disabled={count === 0}
        aria-label={`See the ${count} ${label}`}
        className={
          layout === "inline"
            ? "text-sm transition enabled:hover:opacity-60 disabled:cursor-default md:text-base"
            : "flex flex-col items-center text-sm transition enabled:hover:opacity-60 disabled:cursor-default"
        }
      >
        {layout === "inline" ? (
          <>
            <strong className="font-semibold">{count.toLocaleString()}</strong> {label}
          </>
        ) : (
          <>
            <strong className="font-semibold">{count.toLocaleString()}</strong>
            <span className="text-muted">{label}</span>
          </>
        )}
      </button>

      {open && <VisitorsDialog onClose={() => setOpen(false)} />}
    </>
  );
}
