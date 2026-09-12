import type { Comment, Like, Post, Profile, Visitor } from "@/lib/types";
import { jsonStore } from "./jsonStore";
import { tableStore } from "./tableStore";

/**
 * Everything the app needs from persistence. The JSON driver backs local
 * development; the Table Storage driver backs the deployed container. Nothing
 * above this interface knows or cares which one is in play.
 */
export interface Store {
  getProfile(): Promise<Profile>;
  saveProfile(patch: Partial<Profile>): Promise<Profile>;

  listPosts(): Promise<Post[]>;
  getPost(id: string): Promise<Post | null>;
  createPost(post: Post): Promise<Post>;
  updatePost(id: string, patch: Partial<Post>): Promise<Post | null>;
  deletePost(id: string): Promise<Post | null>;

  listComments(postId?: string): Promise<Comment[]>;
  addComment(comment: Comment): Promise<Comment>;
  deleteComment(id: string): Promise<boolean>;

  listLikes(postId?: string): Promise<Like[]>;
  toggleLike(like: Like): Promise<{ liked: boolean; count: number }>;

  listVisitors(): Promise<Visitor[]>;
  getVisitor(id: string): Promise<Visitor | null>;
  upsertVisitor(visitor: Visitor): Promise<Visitor>;
  /** Look someone up by the pair they type to get back in. */
  findVisitorByCode(nickname: string, code: string): Promise<Visitor | null>;
  /**
   * Remove a visitor along with everything they left: their comments and their
   * likes. Returns the removed record, or null if there was no such visitor.
   */
  deleteVisitor(id: string): Promise<Visitor | null>;
  /** Flag a visitor as having lost their code, recording where to reply. */
  requestCodeReset(nickname: string, email: string): Promise<Visitor | null>;
  /** Issue a fresh code and clear the pending request. */
  regenerateCode(id: string): Promise<Visitor | null>;
}

const driver = process.env.UNINSTAGRAM_STORE ?? "json";

export const store: Store = (() => {
  switch (driver) {
    case "json":
      return jsonStore;
    case "azure":
      return tableStore;
    default:
      throw new Error(
        `Unknown UNINSTAGRAM_STORE driver "${driver}". Supported: json, azure`,
      );
  }
})();
