"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useIdentity } from "./IdentityProvider";
import { CarouselIcon, CommentIcon, HeartFilledIcon } from "./Icons";
import { mediaUrl } from "@/lib/mediaUrl";
import type { PostWithMeta } from "@/lib/types";

const SORTS = {
  "memory-desc": { label: "Memory date · newest first", field: "takenAt", dir: -1 },
  "memory-asc": { label: "Memory date · oldest first", field: "takenAt", dir: 1 },
  "upload-desc": { label: "Upload date · newest first", field: "createdAt", dir: -1 },
  "upload-asc": { label: "Upload date · oldest first", field: "createdAt", dir: 1 },
} as const;

type SortKey = keyof typeof SORTS;

const STORAGE_KEY = "uninstagram:sort";
const DEFAULT_SORT: SortKey = "memory-desc";

export default function PostGrid({ posts }: { posts: PostWithMeta[] }) {
  const router = useRouter();
  const { ensureIdentity } = useIdentity();
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT);

  // Read after mount: touching localStorage during render would not match the
  // server-rendered markup.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && saved in SORTS) setSort(saved as SortKey);
    } catch {
      /* Private windows can refuse storage; the default order is fine. */
    }
  }, []);

  function choose(next: SortKey) {
    setSort(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* Not worth telling anyone about. */
    }
  }

  const ordered = useMemo(() => {
    const { field, dir } = SORTS[sort];
    return [...posts].sort((a, b) => {
      const left = field === "takenAt" ? a.takenAt : a.createdAt;
      const right = field === "takenAt" ? b.takenAt : b.createdAt;
      const primary = left.localeCompare(right) * dir;
      // Same memory date? Fall back to upload order so it never shuffles.
      return primary !== 0 ? primary : a.createdAt.localeCompare(b.createdAt) * dir;
    });
  }, [posts, sort]);

  async function open(id: string) {
    const ok = await ensureIdentity();
    if (ok) router.push(`/p/${id}`, { scroll: false });
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2 px-4 pb-3 pt-1 md:px-0">
        <label htmlFor="post-sort" className="text-xs text-muted">
          Sort by
        </label>
        <div className="relative">
          <select
            id="post-sort"
            value={sort}
            onChange={(event) => choose(event.target.value as SortKey)}
            className="appearance-none rounded-lg bg-button py-1.5 pl-3 pr-8 text-xs font-semibold outline-none transition hover:bg-button-hover"
          >
            {Object.entries(SORTS).map(([key, option]) => (
              <option key={key} value={key}>
                {option.label}
              </option>
            ))}
          </select>
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-[3px] md:gap-1">
        {ordered.map((post) => (
          // The white frame matches the one burned into the full-size photo. It is
          // drawn here rather than baked into the thumbnail because the grid crops
          // tiles square: a baked-in border would be sliced unevenly on whichever
          // edge got cropped. Padding also scales with the tile, so it stays the
          // same relative weight on a phone and on a wide screen.
          <button
            key={post.id}
            onClick={() => open(post.id)}
            className="group aspect-square bg-white p-[2.2%]"
            aria-label={post.caption ? post.caption.slice(0, 80) : "Open photo"}
          >
            <span className="relative block h-full w-full overflow-hidden bg-button">
              <img
                src={mediaUrl(post.media[0].thumbKey)}
                alt={post.caption ? post.caption.slice(0, 120) : "Photo"}
                loading="lazy"
                className="h-full w-full object-cover"
              />

              {post.media.length > 1 && (
                <span className="absolute right-2 top-2 text-white drop-shadow">
                  <CarouselIcon />
                </span>
              )}

              <span className="absolute inset-0 hidden items-center justify-center gap-6 bg-black/35 text-white opacity-0 transition-opacity group-hover:opacity-100 md:flex">
                <span className="flex items-center gap-1.5 font-semibold">
                  <HeartFilledIcon className="h-5 w-5" />
                  {post.likeCount}
                </span>
                <span className="flex items-center gap-1.5 font-semibold">
                  <CommentIcon className="h-5 w-5" strokeWidth={2.4} />
                  {post.commentCount}
                </span>
              </span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
