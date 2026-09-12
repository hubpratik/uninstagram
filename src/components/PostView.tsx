"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Avatar from "./Avatar";
import Carousel from "./Carousel";
import { useIdentity } from "./IdentityProvider";
import {
  BookmarkIcon,
  CommentIcon,
  HeartFilledIcon,
  HeartIcon,
  MoreIcon,
  ShareIcon,
} from "./Icons";
import { memoryDate, plural, timeAgo, todayAsDateInput } from "@/lib/format";
import type { Comment, PostWithMeta, Profile } from "@/lib/types";
import type { CommenterIcons } from "@/lib/feed";

export default function PostView({
  post,
  comments: initialComments,
  profile,
  icons = {},
  variant = "page",
  onClose,
}: {
  post: PostWithMeta;
  comments: Comment[];
  profile: Profile;
  icons?: CommenterIcons;
  variant?: "page" | "modal";
  onClose?: () => void;
}) {
  const router = useRouter();
  const { visitor, isAdmin, ensureIdentity } = useIdentity();

  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [comments, setComments] = useState(initialComments);
  const [draft, setDraft] = useState("");
  const [burst, setBurst] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(post.caption);
  const [captionDraft, setCaptionDraft] = useState(post.caption);
  const [takenAt, setTakenAt] = useState(post.takenAt);
  const [takenDraft, setTakenDraft] = useState(post.takenAt);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ownerName = profile.displayName || profile.username;

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2200);
  }

  function popHeart() {
    setBurst(true);
    window.setTimeout(() => setBurst(false), 1000);
  }

  async function toggleLike(mode?: "double-tap") {
    const ok = await ensureIdentity(`Tell ${ownerName} who is liking this.`);
    if (!ok) return;

    // A double tap on an already-liked photo just replays the heart.
    if (mode === "double-tap" && liked) {
      popHeart();
      return;
    }

    const next = !liked;
    setLiked(next);
    setLikeCount((count) => count + (next ? 1 : -1));
    if (next) popHeart();

    const response = await fetch(`/api/posts/${post.id}/like`, { method: "POST" });
    if (!response.ok) {
      setLiked(!next);
      setLikeCount((count) => count + (next ? -1 : 1));
      return;
    }

    const data = (await response.json()) as { liked: boolean; count: number };
    setLiked(data.liked);
    setLikeCount(data.count);
    router.refresh();
  }

  async function submitComment(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;

    const ok = await ensureIdentity(`Put a name to your comment so ${ownerName} knows who wrote it.`);
    if (!ok) return;

    setBusy(true);
    const response = await fetch(`/api/posts/${post.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    setBusy(false);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      flash(data.error ?? "Could not post that comment.");
      return;
    }

    const data = (await response.json()) as { comment: Comment };
    setComments((current) => [...current, data.comment]);
    setDraft("");
    router.refresh();
  }

  async function removeComment(id: string) {
    const response = await fetch(`/api/comments/${id}`, { method: "DELETE" });
    if (!response.ok) {
      flash("Could not delete that comment.");
      return;
    }
    setComments((current) => current.filter((comment) => comment.id !== id));
    router.refresh();
  }

  async function saveEdits() {
    if (!takenDraft) {
      flash("Add the date this was taken.");
      return;
    }

    setBusy(true);
    const response = await fetch(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caption: captionDraft, takenAt: takenDraft }),
    });
    setBusy(false);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      flash(data.error ?? "Could not save the changes.");
      return;
    }
    setCaption(captionDraft.trim());
    setTakenAt(takenDraft);
    setEditing(false);
    router.refresh();
  }

  async function deletePost() {
    if (!window.confirm("Delete this post for good? The photos go with it.")) return;

    setBusy(true);
    const response = await fetch(`/api/posts/${post.id}`, { method: "DELETE" });
    setBusy(false);

    if (!response.ok) {
      flash("Could not delete the post.");
      return;
    }
    onClose?.();
    router.push("/");
    router.refresh();
  }

  async function share() {
    const url = `${window.location.origin}/p/${post.id}`;
    try {
      await navigator.clipboard.writeText(url);
      flash("Link copied");
    } catch {
      flash(url);
    }
  }

  const canDelete = (comment: Comment) => isAdmin || comment.visitorId === visitor?.id;

  const header = (
    <div className="flex items-center gap-3 border-b border-line px-4 py-3">
      <Avatar asset={profile.avatar} name={ownerName} size="md" ring />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-semibold">{profile.username}</p>
        {post.location && <p className="truncate text-xs">{post.location}</p>}
      </div>
      {isAdmin && (
        <div className="relative">
          <button onClick={() => setMenuOpen((open) => !open)} aria-label="Post options">
            <MoreIcon className="h-5 w-5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-7 z-20 w-44 overflow-hidden rounded-lg border border-line bg-elevated text-sm shadow-lg">
              <button
                onClick={() => {
                  setEditing(true);
                  setMenuOpen(false);
                }}
                className="block w-full px-4 py-2.5 text-left hover:bg-button"
              >
                Edit post
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  void deletePost();
                }}
                className="block w-full border-t border-line px-4 py-2.5 text-left font-semibold text-heart hover:bg-button"
              >
                Delete post
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const captionBlock = caption ? (
    <div className="flex gap-3 px-4 py-3">
      <Avatar asset={profile.avatar} name={ownerName} size="md" />
      <p className="min-w-0 text-sm leading-[1.3rem]">
        <span className="font-semibold">{profile.username}</span>{" "}
        <span className="whitespace-pre-line">{caption}</span>
        <span className="mt-1 block text-xs text-muted">
          Memory captured on {memoryDate(takenAt)}
        </span>
      </p>
    </div>
  ) : null;

  const commentList = (
    <div className="flex-1 overflow-y-auto">
      {editing ? (
        <div className="p-4">
          <textarea
            value={captionDraft}
            onChange={(event) => setCaptionDraft(event.target.value)}
            rows={5}
            maxLength={2200}
            placeholder="Write a caption…"
            className="w-full resize-none rounded-md border border-line bg-bg p-3 text-sm outline-none focus:border-muted"
          />

          <label className="mt-3 block">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              When was this taken?
            </span>
            <input
              type="date"
              value={takenDraft}
              max={todayAsDateInput()}
              onChange={(event) => setTakenDraft(event.target.value)}
              className="mt-1.5 w-full rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-muted"
            />
          </label>

          <div className="mt-3 flex gap-2">
            <button
              onClick={saveEdits}
              disabled={busy}
              className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => {
                setCaptionDraft(caption);
                setTakenDraft(takenAt);
                setEditing(false);
              }}
              className="rounded-lg bg-button px-4 py-1.5 text-sm font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        captionBlock
      )}

      {comments.map((comment) => (
        <div key={comment.id} className="group flex items-start gap-3 px-4 py-2">
          <Avatar
            asset={
              comment.visitorId === "owner"
                ? profile.avatar
                : (icons[comment.visitorId]?.avatar ?? null)
            }
            animal={comment.visitorId === "owner" ? null : icons[comment.visitorId]?.animal}
            name={comment.nickname}
            size="md"
          />
          <p className="min-w-0 flex-1 text-sm leading-[1.3rem]">
            <span className="font-semibold">{comment.nickname}</span>{" "}
            <span className="whitespace-pre-line break-words">{comment.text}</span>
            <span suppressHydrationWarning className="mt-0.5 block text-xs text-muted">
              {timeAgo(comment.createdAt)}
            </span>
          </p>
          {canDelete(comment) && (
            <button
              onClick={() => removeComment(comment.id)}
              aria-label="Delete comment"
              className="mt-1 text-xs text-muted transition hover:text-heart md:opacity-0 md:group-hover:opacity-100"
            >
              Delete
            </button>
          )}
        </div>
      ))}

      {comments.length === 0 && !caption && !editing && (
        <div className="px-4 py-10 text-center">
          <p className="text-lg font-semibold">No comments yet.</p>
          <p className="mt-1 text-sm text-muted">Start the conversation.</p>
        </div>
      )}
    </div>
  );

  const actions = (
    <div className="border-t border-line px-4 pt-3">
      <div className="flex items-center gap-4">
        <button onClick={() => toggleLike()} aria-label={liked ? "Unlike" : "Like"}>
          {liked ? (
            <HeartFilledIcon className="h-6 w-6 text-heart" />
          ) : (
            <HeartIcon className="h-6 w-6 transition hover:opacity-50" />
          )}
        </button>
        <label htmlFor={`comment-${post.id}`} className="cursor-pointer">
          <CommentIcon className="h-6 w-6 transition hover:opacity-50" />
        </label>
        <button onClick={share} aria-label="Copy link">
          <ShareIcon className="h-6 w-6 transition hover:opacity-50" />
        </button>
        <span className="ml-auto text-faint">
          <BookmarkIcon className="h-6 w-6" />
        </span>
      </div>

      <p className="mt-2 text-sm font-semibold">{plural(likeCount, "like")}</p>
      {/* Relative to "now", so the server's value and the browser's differ by a
          second or two on hydration. That difference is expected, not a bug. */}
      <p
        suppressHydrationWarning
        className="mt-0.5 text-[10px] uppercase tracking-wide text-muted"
      >
        Uploaded {timeAgo(post.createdAt, "long")}
      </p>
    </div>
  );

  const composer = post.commentsDisabled ? (
    <p className="border-t border-line px-4 py-4 text-center text-sm text-muted">
      Comments are turned off for this post.
    </p>
  ) : (
    <form
      onSubmit={submitComment}
      className="flex items-center gap-3 border-t border-line px-4 py-3"
    >
      <input
        id={`comment-${post.id}`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void submitComment(event);
          }
        }}
        placeholder="Add a comment…"
        maxLength={1000}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
      />
      <button
        type="submit"
        disabled={busy || !draft.trim()}
        className="text-sm font-semibold text-brand disabled:opacity-40"
      >
        Post
      </button>
    </form>
  );

  // Instagram fits the frame to the first photo, clamped between 4:5 and 1.91:1,
  // so a carousel of mixed shapes still scrolls inside one steady box.
  const first = post.media[0];
  const ratio = Math.min(1.91, Math.max(0.8, first.width / first.height));

  const imagePane = (
    <div
      className="relative flex min-w-0 flex-1 items-center justify-center bg-black"
      style={variant === "modal" ? undefined : { aspectRatio: ratio }}
    >
      <Carousel
        media={post.media}
        alt={caption || "Photo"}
        onDoubleTap={() => void toggleLike("double-tap")}
        fill
      />
      {burst && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <HeartFilledIcon className="heart-burst h-28 w-28 text-white/90" />
        </span>
      )}
    </div>
  );

  const sidebar = (
    <div
      className={`flex min-w-0 flex-col bg-bg ${
        variant === "modal"
          ? "md:h-full md:w-[405px] md:shrink-0 md:border-l md:border-line"
          : "md:w-[405px] md:shrink-0 md:border-l md:border-line"
      }`}
    >
      <div className="hidden md:block">{header}</div>
      {commentList}
      {actions}
      {composer}
    </div>
  );

  return (
    <div className="relative flex h-full w-full flex-col bg-bg md:flex-row md:items-stretch">
      <div className="md:hidden">{header}</div>
      {imagePane}
      {sidebar}
      {notice && (
        <div className="pointer-events-none absolute bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-lg bg-black/85 px-4 py-2 text-sm text-white">
          {notice}
        </div>
      )}
    </div>
  );
}
