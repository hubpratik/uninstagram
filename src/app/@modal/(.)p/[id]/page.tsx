import { notFound } from "next/navigation";
import PostModal from "@/components/PostModal";
import { loadPost } from "@/lib/feed";

export default async function InterceptedPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await loadPost(id);
  if (!data) notFound();

  return (
    <PostModal
      post={data.post}
      comments={data.comments}
      icons={data.icons}
      profile={data.viewer.profile}
    />
  );
}
