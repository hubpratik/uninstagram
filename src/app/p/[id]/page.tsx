import Link from "next/link";
import { notFound } from "next/navigation";
import PostView from "@/components/PostView";
import { loadPost } from "@/lib/feed";

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadPost(id);
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-[935px] px-0 py-0 md:px-4 md:py-8">
      <div className="overflow-hidden border-line md:rounded-sm md:border">
        <PostView
          post={data.post}
          comments={data.comments}
          icons={data.icons}
          profile={data.viewer.profile}
        />
      </div>
      <div className="px-4 py-6 text-center md:px-0">
        <Link href="/" className="text-sm font-semibold text-brand">
          Back to the grid
        </Link>
      </div>
    </div>
  );
}
