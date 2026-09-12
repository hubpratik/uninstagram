"use client";

import Link from "next/link";
import { useState } from "react";
import { useIdentity } from "./IdentityProvider";
import EditProfileDialog from "./EditProfileDialog";
import type { Profile } from "@/lib/types";

export default function ProfileActions({ profile }: { profile: Profile }) {
  const { visitor, isAdmin, editIdentity, ensureIdentity } = useIdentity();
  const [editing, setEditing] = useState(false);

  const buttonClass =
    "rounded-lg bg-button px-4 py-1.5 text-sm font-semibold transition hover:bg-button-hover";

  if (isAdmin) {
    return (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setEditing(true)} className={buttonClass}>
            Edit profile
          </button>
          <Link href="/admin" className={buttonClass}>
            Manage
          </Link>
        </div>
        {editing && (
          <EditProfileDialog profile={profile} onClose={() => setEditing(false)} />
        )}
      </>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {visitor ? (
        <button onClick={editIdentity} className={buttonClass}>
          Visiting as {visitor.nickname}
        </button>
      ) : (
        <button
          onClick={() => ensureIdentity()}
          className="rounded-lg bg-brand px-5 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-hover"
        >
          Say hi
        </button>
      )}
    </div>
  );
}
