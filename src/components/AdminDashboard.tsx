"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Avatar from "./Avatar";
import EditProfileDialog from "./EditProfileDialog";
import UploadDialog from "./UploadDialog";
import { PlusSquareIcon } from "./Icons";
import { mediaUrl } from "@/lib/mediaUrl";
import { memoryDate, plural, timeAgo } from "@/lib/format";
import type { PostWithMeta, Profile, VisitorWithActivity } from "@/lib/types";

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-line px-4 py-3">
      <p className="text-2xl font-semibold">{value.toLocaleString()}</p>
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
    </div>
  );
}

export default function AdminDashboard({
  profile,
  posts,
  visitors,
  likeCount,
  commentCount,
}: {
  profile: Profile;
  posts: PostWithMeta[];
  visitors: VisitorWithActivity[];
  likeCount: number;
  commentCount: number;
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<"posts" | "visitors">("posts");
  const [removing, setRemoving] = useState<string | null>(null);
  const [issuing, setIssuing] = useState<string | null>(null);
  const [newCode, setNewCode] = useState<{ id: string; code: string } | null>(null);

  async function lock() {
    await fetch("/api/admin/session", { method: "DELETE" });
    router.refresh();
    router.push("/");
  }

  async function deletePost(id: string) {
    if (!window.confirm("Delete this post for good? The photos go with it.")) return;
    await fetch(`/api/posts/${id}`, { method: "DELETE" });
    router.refresh();
  }

  async function removeVisitor(visitor: VisitorWithActivity) {
    // Spell out the collateral damage: their comments and likes go too, and a
    // removed visitor can rejoin under the same nickname with a brand new code.
    const traces = [
      visitor.commentCount ? plural(visitor.commentCount, "comment") : "",
      visitor.likeCount ? plural(visitor.likeCount, "like") : "",
    ]
      .filter(Boolean)
      .join(" and ");

    const message = traces
      ? `Remove ${visitor.nickname}? This also deletes their ${traces}.`
      : `Remove ${visitor.nickname}? They have left no comments or likes.`;

    if (!window.confirm(message)) return;

    setRemoving(visitor.id);
    const response = await fetch(`/api/visitors/${visitor.id}`, { method: "DELETE" });
    setRemoving(null);

    if (!response.ok) {
      window.alert("Could not remove that visitor.");
      return;
    }
    router.refresh();
  }

  async function issueNewCode(visitor: VisitorWithActivity) {
    if (
      !window.confirm(
        `Issue a new code for ${visitor.nickname}? Their old code stops working immediately.`,
      )
    )
      return;

    setIssuing(visitor.id);
    const response = await fetch(`/api/visitors/${visitor.id}/code`, { method: "POST" });
    setIssuing(null);

    if (!response.ok) {
      window.alert("Could not issue a new code.");
      return;
    }
    const data = (await response.json()) as { code: string };
    // Held on screen so it can be copied into an email — nothing is sent for you.
    setNewCode({ id: visitor.id, code: data.code });
    router.refresh();
  }

  const subscribers = visitors.filter((visitor) => visitor.email);
  const pendingResets = visitors.filter((visitor) => visitor.codeResetRequestedAt);

  return (
    <div className="px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar asset={profile.avatar} name={profile.displayName || profile.username} size="lg" ring />
          <div>
            <h1 className="text-xl font-semibold">{profile.displayName || profile.username}</h1>
            <p className="text-sm text-muted">Your Uninstagram, your rules.</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setUploading(true)}
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover"
          >
            <PlusSquareIcon className="h-4 w-4" />
            New post
          </button>
          <button
            onClick={() => setEditing(true)}
            className="rounded-lg bg-button px-4 py-2 text-sm font-semibold transition hover:bg-button-hover"
          >
            Edit profile
          </button>
          <Link
            href="/"
            className="rounded-lg bg-button px-4 py-2 text-sm font-semibold transition hover:bg-button-hover"
          >
            View as page
          </Link>
          <button
            onClick={lock}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-heart transition hover:bg-button"
          >
            Lock admin
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat value={posts.length} label="posts" />
        <Stat value={visitors.length} label="visitors" />
        <Stat value={likeCount} label="likes" />
        <Stat value={commentCount} label="comments" />
      </div>

      <div className="mt-8 flex gap-6 border-b border-line">
        {(["posts", "visitors"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 pb-3 text-sm font-semibold capitalize transition ${
              tab === key ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {key}
            {key === "visitors" && pendingResets.length > 0 && (
              <span className="ml-2 rounded-full bg-heart px-2 py-0.5 text-xs font-semibold normal-case text-white">
                {pendingResets.length} need a code
              </span>
            )}
            {/* Only ever one badge here, and only for something you can act on.
                A standing count of subscribers read as an alert that would not
                clear, because there was nothing to clear. */}
          </button>
        ))}
      </div>

      {tab === "posts" ? (
        <div className="mt-6 space-y-3">
          {posts.length === 0 && (
            <p className="py-10 text-center text-sm text-muted">Nothing posted yet.</p>
          )}
          {posts.map((post) => (
            <div
              key={post.id}
              className="flex flex-col gap-3 rounded-xl border border-line p-3 sm:flex-row sm:items-center sm:gap-4"
            >
              <div className="flex min-w-0 items-center gap-3 sm:flex-1 sm:gap-4">
                <img
                  src={mediaUrl(post.media[0].thumbKey)}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-lg object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {post.caption || <span className="text-muted">No caption</span>}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    <span className="text-ink">{memoryDate(post.takenAt)}</span> ·{" "}
                    {plural(post.media.length, "photo")} · {plural(post.likeCount, "like")} ·{" "}
                    {plural(post.commentCount, "comment")}
                  </p>
                  <p suppressHydrationWarning className="text-xs text-muted">
                    posted {timeAgo(post.createdAt, "long")}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-2 sm:justify-end">
                <Link
                  href={`/p/${post.id}`}
                  className="rounded-lg bg-button px-3 py-1.5 text-sm font-semibold transition hover:bg-button-hover"
                >
                  Open
                </Link>
                <button
                  onClick={() => deletePost(post.id)}
                  className="rounded-lg px-3 py-1.5 text-sm font-semibold text-heart transition hover:bg-button"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {visitors.length === 0 && (
            <p className="py-10 text-center text-sm text-muted">
              Nobody has left a nickname yet.
            </p>
          )}
          {visitors.map((visitor) => (
            <div
              key={visitor.id}
              className={`rounded-xl border p-3 ${
                visitor.codeResetRequestedAt ? "border-heart" : "border-line"
              }`}
            >
              {visitor.codeResetRequestedAt && (
                <div className="mb-3 rounded-lg bg-heart/10 px-3 py-2">
                  <p suppressHydrationWarning className="text-sm font-semibold text-heart">
                    Asked for a new code {timeAgo(visitor.codeResetRequestedAt)} ago
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    Send it to{" "}
                    <a href={`mailto:${visitor.codeResetEmail}`} className="text-brand underline">
                      {visitor.codeResetEmail}
                    </a>
                    {visitor.email && visitor.codeResetEmail !== visitor.email && (
                      <span className="text-heart">
                        {" "}
                        — note this differs from the address on their account ({visitor.email})
                      </span>
                    )}
                  </p>
                </div>
              )}

              {newCode?.id === visitor.id && (
                <div className="mb-3 rounded-lg border border-line bg-button/60 px-3 py-2 text-center">
                  <p className="text-xs uppercase tracking-wide text-muted">New code</p>
                  <p className="font-mono text-2xl font-semibold tracking-[0.3em]">
                    {newCode.code}
                  </p>
                  <p className="mt-1 text-xs text-muted">Copy this and email it to them.</p>
                </div>
              )}

              {/* Stacked on a phone. Squeezing the nickname, the email, the code
                  and two buttons onto one line left the name a single letter wide. */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex min-w-0 items-center gap-3 sm:flex-1">
                  <Avatar
                    asset={visitor.avatar}
                    animal={visitor.animal}
                    name={visitor.nickname}
                    size="lg"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{visitor.nickname}</p>
                    {visitor.email ? (
                      <a
                        href={`mailto:${visitor.email}`}
                        className="block truncate text-xs text-brand hover:underline"
                      >
                        {visitor.email}
                      </a>
                    ) : (
                      <p className="truncate text-xs text-muted">No email left</p>
                    )}
                    <p suppressHydrationWarning className="truncate text-xs text-muted">
                      last seen {timeAgo(visitor.lastSeenAt)} ·{" "}
                      {plural(visitor.commentCount, "comment")} ·{" "}
                      {plural(visitor.likeCount, "like")}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:flex-nowrap sm:justify-end">
                  {/* Hidden on a phone: the address itself is sitting two lines
                      above, so the pill only costs the row its last button. */}
                  {visitor.email && (
                    <span className="hidden rounded-full bg-button px-3 py-1 text-xs font-semibold sm:inline-block">
                      wants updates
                    </span>
                  )}
                  <span
                    className="font-mono text-sm font-semibold tracking-[0.2em]"
                    title={`${visitor.nickname} can use this code to get back in`}
                  >
                    {visitor.code}
                  </span>
                  <button
                    onClick={() => issueNewCode(visitor)}
                    disabled={issuing === visitor.id}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:opacity-50 ${
                      visitor.codeResetRequestedAt
                        ? "bg-brand text-white hover:bg-brand-hover"
                        : "bg-button hover:bg-button-hover"
                    }`}
                  >
                    {issuing === visitor.id ? "Issuing…" : "New code"}
                  </button>
                  <button
                    onClick={() => removeVisitor(visitor)}
                    disabled={removing === visitor.id}
                    className="rounded-lg px-3 py-1.5 text-sm font-semibold text-heart transition hover:bg-button disabled:opacity-50"
                  >
                    {removing === visitor.id ? "Removing…" : "Remove"}
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* Folded away by default. Open, it looked like an outstanding task
              sitting under the list rather than a tool you reach for. */}
          {subscribers.length > 0 && (
            <details className="rounded-xl border border-line">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold marker:content-none">
                Email list{" "}
                <span className="font-normal text-muted">
                  · {plural(subscribers.length, "address", "addresses")}
                </span>
              </summary>
              <div className="px-4 pb-4">
                <p className="text-xs text-muted">
                  Copy this when you want to tell people about a new post. Nothing is ever sent
                  automatically.
                </p>
                <textarea
                  readOnly
                  rows={3}
                  value={subscribers.map((visitor) => visitor.email).join(", ")}
                  className="mt-2 w-full resize-none rounded-md border border-line bg-bg p-3 text-xs outline-none"
                />
              </div>
            </details>
          )}
        </div>
      )}

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
      {editing && <EditProfileDialog profile={profile} onClose={() => setEditing(false)} />}
    </div>
  );
}
