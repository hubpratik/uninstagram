import { promises as fs } from "node:fs";
import path from "node:path";
import { randomInt } from "node:crypto";
import { randomAnimalKey } from "@/lib/animals";
import type { Comment, Like, Post, Profile, Visitor } from "@/lib/types";
import type { Store } from "./index";

const DATA_DIR = path.join(process.cwd(), "data");

const FILES = {
  profile: path.join(DATA_DIR, "profile.json"),
  posts: path.join(DATA_DIR, "posts.json"),
  comments: path.join(DATA_DIR, "comments.json"),
  likes: path.join(DATA_DIR, "likes.json"),
  visitors: path.join(DATA_DIR, "visitors.json"),
} as const;

const DEFAULT_PROFILE: Profile = {
  username: "uninstagram",
  displayName: "Uninstagram",
  bio: "Photos, kept off the feed.",
  link: "",
  avatar: null,
  updatedAt: new Date(0).toISOString(),
};

/**
 * Serialises every read-modify-write cycle. Node is single threaded but our
 * handlers await between reading and writing, so without this two concurrent
 * likes can clobber each other.
 */
let queue: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

/** Nicknames are matched loosely so "Riya " and "riya" find the same person. */
function normalise(nickname: string): string {
  return nickname.trim().toLowerCase();
}

/**
 * A 5-digit code, unique across everyone. Global uniqueness (rather than just
 * unique per nickname) means a visitor can rename themselves later without
 * their code silently colliding with somebody else's.
 */
function mintCode(taken: Set<string>): string {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const code = String(randomInt(0, 100_000)).padStart(5, "0");
    if (!taken.has(code)) return code;
  }
  throw new Error("Could not find an unused visitor code after 200 tries.");
}

/** Posts written before takenAt existed fall back to their upload date. */
function withTakenAt(post: Post): Post {
  return post.takenAt ? post : { ...post, takenAt: post.createdAt.slice(0, 10) };
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return raw.trim() ? (JSON.parse(raw) as T) : fallback;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, file);
}

/**
 * Visitors saved before codes and animal icons existed get them the first time
 * they are read, so everybody already in the guest book still works.
 */
async function backfillVisitors(): Promise<Visitor[]> {
  const visitors = await readJson<Visitor[]>(FILES.visitors, []);
  if (visitors.every((v) => v.code && v.animal)) return visitors;

  return withLock(async () => {
    const current = await readJson<Visitor[]>(FILES.visitors, []);
    const taken = new Set(current.map((v) => v.code).filter(Boolean));
    let changed = false;

    for (const visitor of current) {
      if (!visitor.code) {
        visitor.code = mintCode(taken);
        taken.add(visitor.code);
        changed = true;
      }
      if (!visitor.animal) {
        visitor.animal = randomAnimalKey();
        changed = true;
      }
      if (visitor.avatar === undefined) {
        visitor.avatar = null;
        changed = true;
      }
      if (visitor.codeResetRequestedAt === undefined) {
        visitor.codeResetRequestedAt = "";
        visitor.codeResetEmail = "";
        changed = true;
      }
    }

    if (changed) await writeJson(FILES.visitors, current);
    return current;
  });
}

export const jsonStore: Store = {
  async getProfile() {
    const saved = await readJson<Partial<Profile>>(FILES.profile, {});
    return { ...DEFAULT_PROFILE, ...saved };
  },

  async saveProfile(patch) {
    return withLock(async () => {
      const current = { ...DEFAULT_PROFILE, ...(await readJson<Partial<Profile>>(FILES.profile, {})) };
      const next: Profile = { ...current, ...patch, updatedAt: new Date().toISOString() };
      await writeJson(FILES.profile, next);
      return next;
    });
  },

  async listPosts() {
    const posts = await readJson<Post[]>(FILES.posts, []);
    // Newest memory first, not newest upload — the grid reads as a timeline of
    // when things happened. Posts from before takenAt existed fall back to it.
    return posts.map(withTakenAt).sort((a, b) => {
      const byTaken = b.takenAt.localeCompare(a.takenAt);
      return byTaken !== 0 ? byTaken : b.createdAt.localeCompare(a.createdAt);
    });
  },

  async getPost(id) {
    const posts = await readJson<Post[]>(FILES.posts, []);
    const post = posts.find((p) => p.id === id);
    return post ? withTakenAt(post) : null;
  },

  async createPost(post) {
    return withLock(async () => {
      const posts = await readJson<Post[]>(FILES.posts, []);
      posts.push(post);
      await writeJson(FILES.posts, posts);
      return post;
    });
  },

  async updatePost(id, patch) {
    return withLock(async () => {
      const posts = await readJson<Post[]>(FILES.posts, []);
      const index = posts.findIndex((p) => p.id === id);
      if (index === -1) return null;
      const next: Post = { ...posts[index], ...patch, id, updatedAt: new Date().toISOString() };
      posts[index] = next;
      await writeJson(FILES.posts, posts);
      return next;
    });
  },

  async deletePost(id) {
    return withLock(async () => {
      const posts = await readJson<Post[]>(FILES.posts, []);
      const index = posts.findIndex((p) => p.id === id);
      if (index === -1) return null;
      const [removed] = posts.splice(index, 1);
      await writeJson(FILES.posts, posts);

      const comments = await readJson<Comment[]>(FILES.comments, []);
      await writeJson(FILES.comments, comments.filter((c) => c.postId !== id));
      const likes = await readJson<Like[]>(FILES.likes, []);
      await writeJson(FILES.likes, likes.filter((l) => l.postId !== id));

      return removed;
    });
  },

  async listComments(postId) {
    const comments = await readJson<Comment[]>(FILES.comments, []);
    const scoped = postId ? comments.filter((c) => c.postId === postId) : comments;
    return scoped.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async addComment(comment) {
    return withLock(async () => {
      const comments = await readJson<Comment[]>(FILES.comments, []);
      comments.push(comment);
      await writeJson(FILES.comments, comments);
      return comment;
    });
  },

  async deleteComment(id) {
    return withLock(async () => {
      const comments = await readJson<Comment[]>(FILES.comments, []);
      const next = comments.filter((c) => c.id !== id);
      if (next.length === comments.length) return false;
      await writeJson(FILES.comments, next);
      return true;
    });
  },

  async listLikes(postId) {
    const likes = await readJson<Like[]>(FILES.likes, []);
    return postId ? likes.filter((l) => l.postId === postId) : likes;
  },

  async toggleLike(like) {
    return withLock(async () => {
      const likes = await readJson<Like[]>(FILES.likes, []);
      const index = likes.findIndex(
        (l) => l.postId === like.postId && l.visitorId === like.visitorId,
      );
      let liked: boolean;
      if (index === -1) {
        likes.push(like);
        liked = true;
      } else {
        likes.splice(index, 1);
        liked = false;
      }
      await writeJson(FILES.likes, likes);
      return { liked, count: likes.filter((l) => l.postId === like.postId).length };
    });
  },

  async listVisitors() {
    const visitors = await backfillVisitors();
    return [...visitors].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  },

  async getVisitor(id) {
    const visitors = await backfillVisitors();
    return visitors.find((v) => v.id === id) ?? null;
  },

  async findVisitorByCode(nickname, code) {
    const visitors = await backfillVisitors();
    const wanted = normalise(nickname);
    return (
      visitors.find((v) => normalise(v.nickname) === wanted && v.code === code.trim()) ?? null
    );
  },

  async requestCodeReset(nickname, email) {
    return withLock(async () => {
      const visitors = await readJson<Visitor[]>(FILES.visitors, []);
      const wanted = normalise(nickname);
      const index = visitors.findIndex((v) => normalise(v.nickname) === wanted);
      if (index === -1) return null;

      const supplied = email.trim();
      const existing = visitors[index].email;

      visitors[index] = {
        ...visitors[index],
        // Someone who never left an address has now given one — keep it, so the
        // owner can reach them about future posts and not just this one code.
        // An address already on file is never overwritten: anyone can type
        // anyone's nickname into that box, so a claim is not proof.
        email: existing || supplied,
        codeResetRequestedAt: new Date().toISOString(),
        codeResetEmail: supplied,
      };
      await writeJson(FILES.visitors, visitors);
      return visitors[index];
    });
  },

  async regenerateCode(id) {
    return withLock(async () => {
      const visitors = await readJson<Visitor[]>(FILES.visitors, []);
      const index = visitors.findIndex((v) => v.id === id);
      if (index === -1) return null;

      const taken = new Set(visitors.filter((v) => v.id !== id).map((v) => v.code));
      visitors[index] = {
        ...visitors[index],
        code: mintCode(taken),
        codeResetRequestedAt: "",
        codeResetEmail: "",
      };
      await writeJson(FILES.visitors, visitors);
      return visitors[index];
    });
  },

  async deleteVisitor(id) {
    return withLock(async () => {
      const visitors = await readJson<Visitor[]>(FILES.visitors, []);
      const index = visitors.findIndex((v) => v.id === id);
      if (index === -1) return null;
      const [removed] = visitors.splice(index, 1);
      await writeJson(FILES.visitors, visitors);

      // Take their traces with them, otherwise comments keep showing a nickname
      // that no longer belongs to anyone and likes count toward a ghost.
      const comments = await readJson<Comment[]>(FILES.comments, []);
      await writeJson(FILES.comments, comments.filter((c) => c.visitorId !== id));
      const likes = await readJson<Like[]>(FILES.likes, []);
      await writeJson(FILES.likes, likes.filter((l) => l.visitorId !== id));

      return removed;
    });
  },

  async upsertVisitor(visitor) {
    return withLock(async () => {
      const visitors = await readJson<Visitor[]>(FILES.visitors, []);
      const index = visitors.findIndex((v) => v.id === visitor.id);
      const taken = new Set(visitors.map((v) => v.code).filter(Boolean));

      const next: Visitor =
        index === -1
          ? {
              ...visitor,
              code: visitor.code || mintCode(taken),
              animal: visitor.animal || randomAnimalKey(),
            }
          : {
              ...visitors[index],
              ...visitor,
              // A returning visitor keeps the code and the day they first showed up.
              code: visitors[index].code || visitor.code || mintCode(taken),
              animal: visitor.animal || visitors[index].animal || randomAnimalKey(),
              firstSeenAt: visitors[index].firstSeenAt,
            };

      if (index === -1) visitors.push(next);
      else visitors[index] = next;
      await writeJson(FILES.visitors, visitors);
      return next;
    });
  },
};
