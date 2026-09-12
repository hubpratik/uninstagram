import AdminDashboard from "@/components/AdminDashboard";
import AdminUnlock from "@/components/AdminUnlock";
import { loadGrid } from "@/lib/feed";
import { store } from "@/lib/store";

export const metadata = { title: "Manage • Uninstagram" };

export default async function AdminPage() {
  const { viewer, posts, likeCount } = await loadGrid();
  if (!viewer.admin) return <AdminUnlock />;

  const [visitors, comments, likes] = await Promise.all([
    store.listVisitors(),
    store.listComments(),
    store.listLikes(),
  ]);

  // Tally what each visitor has left behind so the manage page can show the
  // cost of removing them before the click, not after.
  const withActivity = visitors.map((visitor) => ({
    ...visitor,
    commentCount: comments.filter((c) => c.visitorId === visitor.id).length,
    likeCount: likes.filter((l) => l.visitorId === visitor.id).length,
  }));

  return (
    <AdminDashboard
      profile={viewer.profile}
      posts={posts}
      visitors={withActivity}
      likeCount={likeCount}
      commentCount={comments.length}
    />
  );
}
