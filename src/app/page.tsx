import PostGrid from "@/components/PostGrid";
import ProfileHeader from "@/components/ProfileHeader";
import { CameraIcon } from "@/components/Icons";
import { loadGrid } from "@/lib/feed";

export default async function HomePage() {
  const { viewer, posts, visitorCount, likeCount } = await loadGrid();

  return (
    <div className="pb-16">
      <ProfileHeader
        profile={viewer.profile}
        postCount={posts.length}
        visitorCount={visitorCount}
        likeCount={likeCount}
      />

      {posts.length > 0 ? (
        <PostGrid posts={posts} />
      ) : (
        <div className="flex flex-col items-center gap-3 border-t border-line px-6 py-20 text-center">
          <span className="rounded-full border-2 border-ink p-4">
            <CameraIcon className="h-9 w-9" />
          </span>
          <p className="text-2xl font-bold">No photos yet</p>
          <p className="max-w-sm text-sm text-muted">
            {viewer.admin
              ? "Tap the + in the top bar to share your first photo."
              : "Nothing has been posted here yet. Check back soon."}
          </p>
        </div>
      )}
    </div>
  );
}
