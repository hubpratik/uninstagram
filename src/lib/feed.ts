import { isAdmin } from "@/lib/admin";
import { store } from "@/lib/store";
import { currentVisitor } from "@/lib/visitor";
import type { Comment, MediaAsset, PostWithMeta, Profile, Visitor } from "@/lib/types";

/** Whatever a commenter's avatar should be, keyed by visitor id. */
export type CommenterIcons = Record<string, { avatar: MediaAsset | null; animal: string }>;

export type ViewerContext = {
  profile: Profile;
  admin: boolean;
  visitor: Visitor | null;
  /** Whose likes count as "mine" — the owner likes as "owner". */
  identityId: string | null;
};

export async function loadViewer(): Promise<ViewerContext> {
  const [profile, admin, visitor] = await Promise.all([
    store.getProfile(),
    isAdmin(),
    currentVisitor(),
  ]);

  return {
    profile,
    admin,
    visitor,
    identityId: visitor?.id ?? (admin ? "owner" : null),
  };
}

export async function loadGrid() {
  const viewer = await loadViewer();
  const [posts, likes, comments, visitors] = await Promise.all([
    store.listPosts(),
    store.listLikes(),
    store.listComments(),
    store.listVisitors(),
  ]);

  const withMeta: PostWithMeta[] = posts.map((post) => {
    const postLikes = likes.filter((like) => like.postId === post.id);
    return {
      ...post,
      likeCount: postLikes.length,
      commentCount: comments.filter((comment) => comment.postId === post.id).length,
      likedByMe: Boolean(
        viewer.identityId && postLikes.some((like) => like.visitorId === viewer.identityId),
      ),
    };
  });

  return {
    viewer,
    posts: withMeta,
    visitorCount: visitors.length,
    likeCount: likes.length,
  };
}

export async function loadPost(id: string): Promise<{
  viewer: ViewerContext;
  post: PostWithMeta;
  comments: Comment[];
  icons: CommenterIcons;
} | null> {
  const post = await store.getPost(id);
  if (!post) return null;

  const [viewer, likes, comments, visitors] = await Promise.all([
    loadViewer(),
    store.listLikes(id),
    store.listComments(id),
    store.listVisitors(),
  ]);

  // Only the people who actually commented here, to keep the payload small.
  const talkers = new Set(comments.map((comment) => comment.visitorId));
  const icons: CommenterIcons = {};
  for (const visitor of visitors) {
    if (talkers.has(visitor.id)) {
      icons[visitor.id] = { avatar: visitor.avatar ?? null, animal: visitor.animal };
    }
  }

  return {
    viewer,
    comments,
    icons,
    post: {
      ...post,
      likeCount: likes.length,
      commentCount: comments.length,
      likedByMe: Boolean(
        viewer.identityId && likes.some((like) => like.visitorId === viewer.identityId),
      ),
    },
  };
}
