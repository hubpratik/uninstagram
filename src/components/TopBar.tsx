"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Avatar from "./Avatar";
import UploadDialog from "./UploadDialog";
import { useIdentity } from "./IdentityProvider";
import { PlusSquareIcon, SettingsIcon } from "./Icons";
import type { Profile } from "@/lib/types";

export default function TopBar({
  profile,
  pendingResets = 0,
}: {
  profile: Profile;
  /** Visitors waiting on a new code. Always 0 for anyone who is not the owner. */
  pendingResets?: number;
}) {
  const { visitor, isAdmin, editIdentity, ensureIdentity } = useIdentity();
  const [uploading, setUploading] = useState(false);
  const router = useRouter();

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 h-[60px] border-b border-line bg-bg">
        <div className="mx-auto flex h-full max-w-[975px] items-center justify-between px-4">
          <Link href="/" className="font-logo text-[28px] leading-none">
            <span className="wordmark-un">Un</span>instagram
          </Link>

          <div className="flex items-center gap-4">
            {isAdmin ? (
              <>
                <button
                  onClick={() => setUploading(true)}
                  title="New post"
                  aria-label="New post"
                  className="transition hover:opacity-60"
                >
                  <PlusSquareIcon />
                </button>
                <Link
                  href="/admin"
                  title={
                    pendingResets > 0
                      ? `Manage — ${pendingResets} waiting on a new code`
                      : "Manage"
                  }
                  aria-label={
                    pendingResets > 0
                      ? `Manage, ${pendingResets} waiting on a new code`
                      : "Manage"
                  }
                  className="relative transition hover:opacity-60"
                >
                  <SettingsIcon />
                  {pendingResets > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-heart px-1 text-[10px] font-bold leading-none text-white ring-2 ring-bg">
                      {pendingResets > 9 ? "9+" : pendingResets}
                    </span>
                  )}
                </Link>
              </>
            ) : visitor ? (
              <button
                onClick={editIdentity}
                className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition hover:bg-button"
                title="Change your nickname"
              >
                <Avatar
                  asset={visitor.avatar}
                  animal={visitor.animal}
                  name={visitor.nickname}
                  size="md"
                />
                <span className="max-w-[120px] truncate text-sm font-semibold">
                  {visitor.nickname}
                </span>
              </button>
            ) : (
              <button
                onClick={() => ensureIdentity()}
                className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-hover"
              >
                Say hi
              </button>
            )}
          </div>
        </div>
      </header>

      {uploading && (
        <UploadDialog
          profile={profile}
          onClose={() => setUploading(false)}
          onDone={() => {
            setUploading(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
