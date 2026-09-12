"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import PostView from "./PostView";
import { CloseIcon } from "./Icons";
import type { Comment, PostWithMeta, Profile } from "@/lib/types";
import type { CommenterIcons } from "@/lib/feed";

export default function PostModal({
  post,
  comments,
  profile,
  icons,
}: {
  post: PostWithMeta;
  comments: Comment[];
  profile: Profile;
  icons: CommenterIcons;
}) {
  const router = useRouter();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") router.back();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [router]);

  return (
    <div
      className="fixed inset-0 z-[90] overflow-y-auto md:flex md:items-center md:justify-center md:p-8"
      style={{ background: "var(--ig-scrim)" }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) router.back();
      }}
    >
      <button
        onClick={() => router.back()}
        aria-label="Close"
        className="fixed right-3 top-3 z-[95] text-white transition hover:opacity-70 md:right-5 md:top-5"
      >
        <CloseIcon className="h-7 w-7" />
      </button>

      <div className="pop-in min-h-full w-full overflow-hidden bg-bg md:h-[min(90vh,760px)] md:min-h-0 md:max-w-[1100px] md:rounded-lg">
        <PostView
          post={post}
          comments={comments}
          icons={icons}
          profile={profile}
          variant="modal"
        />
      </div>
    </div>
  );
}
