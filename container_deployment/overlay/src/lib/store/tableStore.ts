import { randomInt } from "node:crypto";
import { TableClient, odata, type TableEntity } from "@azure/data-tables";
import { randomAnimalKey } from "@/lib/animals";
import type { Comment, Like, Post, Profile, Visitor } from "@/lib/types";
import type { Store } from "./index";

/**
 * Azure Table Storage driver.
 *
 * Shape notes, because Table Storage is not a document store:
 *  - It has no arrays or nested objects, so `media` and `avatar` are stored as
 *    JSON strings and parsed on the way out.
 *  - Partitioning follows how things are read: comments and likes are almost
 *    always fetched per post, so postId is their PartitionKey. Posts, visitors
 *    and the profile are small, single-partition sets.
 *  - Likes use (postId, visitorId) as the key, which makes a like idempotent
 *    and toggling a single-entity operation with no read-modify-write race.
 *  - Property values cap at 64 KB and entities at 1 MB. A 2,200-character
 *    caption and ten media records are nowhere near either.
 */

const CONNECTION = process.env.AZURE_STORAGE_CONNECTION_STRING ?? "";

const TABLES = {
  profile: process.env.AZURE_TABLE_PROFILE ?? "profile",
  posts: process.env.AZURE_TABLE_POSTS ?? "posts",
  comments: process.env.AZURE_TABLE_COMMENTS ?? "comments",
  likes: process.env.AZURE_TABLE_LIKES ?? "likes",
  visitors: process.env.AZURE_TABLE_VISITORS ?? "visitors",
} as const;

const clients = new Map<string, Promise<TableClient>>();

function table(name: string): Promise<TableClient> {
  if (!CONNECTION) throw new Error("AZURE_STORAGE_CONNECTION_STRING is not set.");

  let existing = clients.get(name);
  if (!existing) {
    existing = (async () => {
      const client = TableClient.fromConnectionString(CONNECTION, name, {
        allowInsecureConnection: CONNECTION.includes("UseDevelopmentStorage"),
      });
      await client.createTable().catch((error: { statusCode?: number }) => {
        // 409 just means someone else created it first.
        if (error.statusCode !== 409) throw error;
      });
      return client;
    })().catch((error) => {
      clients.delete(name);
      throw error;
    });
    clients.set(name, existing);
  }
  return existing;
}

async function collect<T extends object>(
  name: string,
  filter?: string,
): Promise<(T & { partitionKey: string; rowKey: string })[]> {
  const client = await table(name);
  const options = filter ? { queryOptions: { filter } } : undefined;
  const out: (T & { partitionKey: string; rowKey: string })[] = [];
  for await (const entity of client.listEntities<T>(options)) {
    out.push(entity as T & { partitionKey: string; rowKey: string });
  }
  return out;
}

async function findOne<T extends object>(
  name: string,
  partitionKey: string,
  rowKey: string,
): Promise<T | null> {
  const client = await table(name);
  try {
    return (await client.getEntity<T>(partitionKey, rowKey)) as T;
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 404) return null;
    throw error;
  }
}

/* ------------------------------------------------------------------ profile */

const DEFAULT_PROFILE: Profile = {
  username: "uninstagram",
  displayName: "Uninstagram",
  bio: "Photos, kept off the feed.",
  link: "",
  avatar: null,
  updatedAt: new Date(0).toISOString(),
};

type ProfileEntity = TableEntity<{
  username: string;
  displayName: string;
  bio: string;
  link: string;
  avatarJson: string;
  updatedAt: string;
}>;

function toProfile(entity: ProfileEntity | null): Profile {
  if (!entity) return DEFAULT_PROFILE;
  return {
    username: entity.username,
    displayName: entity.displayName,
    bio: entity.bio,
    link: entity.link,
    avatar: entity.avatarJson ? JSON.parse(entity.avatarJson) : null,
    updatedAt: entity.updatedAt,
  };
}

/* -------------------------------------------------------------------- posts */

type PostEntity = TableEntity<{
  mediaJson: string;
  caption: string;
  location: string;
  commentsDisabled: boolean;
  takenAt: string;
  createdAt: string;
  updatedAt: string;
}>;

function toPost(entity: PostEntity): Post {
  return {
    id: entity.rowKey,
    media: JSON.parse(entity.mediaJson),
    caption: entity.caption,
    location: entity.location,
    commentsDisabled: entity.commentsDisabled,
    takenAt: entity.takenAt || entity.createdAt.slice(0, 10),
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

function fromPost(post: Post): PostEntity {
  return {
    partitionKey: "post",
    rowKey: post.id,
    mediaJson: JSON.stringify(post.media),
    caption: post.caption,
    location: post.location,
    commentsDisabled: post.commentsDisabled,
    takenAt: post.takenAt,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

/* ----------------------------------------------------------------- visitors */

type VisitorEntity = TableEntity<{
  nickname: string;
  nicknameLower: string;
  email: string;
  code: string;
  avatarJson: string;
  animal: string;
  notify: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  codeResetRequestedAt: string;
  codeResetEmail: string;
}>;

function toVisitor(entity: VisitorEntity): Visitor {
  return {
    id: entity.rowKey,
    nickname: entity.nickname,
    email: entity.email,
    code: entity.code,
    avatar: entity.avatarJson ? JSON.parse(entity.avatarJson) : null,
    animal: entity.animal,
    notify: entity.notify,
    firstSeenAt: entity.firstSeenAt,
    lastSeenAt: entity.lastSeenAt,
    codeResetRequestedAt: entity.codeResetRequestedAt ?? "",
    codeResetEmail: entity.codeResetEmail ?? "",
  };
}

function fromVisitor(visitor: Visitor): VisitorEntity {
  return {
    partitionKey: "visitor",
    rowKey: visitor.id,
    nickname: visitor.nickname,
    // Table Storage filters are case-sensitive, so the lookup key is stored
    // pre-lowered rather than trying to normalise at query time.
    nicknameLower: visitor.nickname.trim().toLowerCase(),
    email: visitor.email,
    code: visitor.code,
    avatarJson: visitor.avatar ? JSON.stringify(visitor.avatar) : "",
    animal: visitor.animal,
    notify: visitor.notify,
    firstSeenAt: visitor.firstSeenAt,
    lastSeenAt: visitor.lastSeenAt,
    codeResetRequestedAt: visitor.codeResetRequestedAt ?? "",
    codeResetEmail: visitor.codeResetEmail ?? "",
  };
}

function mintCode(taken: Set<string>): string {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const code = String(randomInt(0, 100_000)).padStart(5, "0");
    if (!taken.has(code)) return code;
  }
  throw new Error("Could not find an unused visitor code after 200 tries.");
}

/* -------------------------------------------------------------------- store */

export const tableStore: Store = {
  async getProfile() {
    return toProfile(await findOne<ProfileEntity>(TABLES.profile, "profile", "profile"));
  },

  async saveProfile(patch) {
    const current = await this.getProfile();
    const next: Profile = { ...current, ...patch, updatedAt: new Date().toISOString() };
    const client = await table(TABLES.profile);
    await client.upsertEntity(
      {
        partitionKey: "profile",
        rowKey: "profile",
        username: next.username,
        displayName: next.displayName,
        bio: next.bio,
        link: next.link,
        avatarJson: next.avatar ? JSON.stringify(next.avatar) : "",
        updatedAt: next.updatedAt,
      } satisfies ProfileEntity,
      "Replace",
    );
    return next;
  },

  async listPosts() {
    const rows = await collect<PostEntity>(TABLES.posts);
    return rows.map(toPost).sort((a, b) => {
      const byTaken = b.takenAt.localeCompare(a.takenAt);
      return byTaken !== 0 ? byTaken : b.createdAt.localeCompare(a.createdAt);
    });
  },

  async getPost(id) {
    const entity = await findOne<PostEntity>(TABLES.posts, "post", id);
    return entity ? toPost(entity) : null;
  },

  async createPost(post) {
    const client = await table(TABLES.posts);
    await client.createEntity(fromPost(post));
    return post;
  },

  async updatePost(id, patch) {
    const current = await this.getPost(id);
    if (!current) return null;
    const next: Post = { ...current, ...patch, id, updatedAt: new Date().toISOString() };
    const client = await table(TABLES.posts);
    await client.upsertEntity(fromPost(next), "Replace");
    return next;
  },

  async deletePost(id) {
    const current = await this.getPost(id);
    if (!current) return null;

    const posts = await table(TABLES.posts);
    await posts.deleteEntity("post", id);

    // Comments and likes are partitioned by postId, so both clear out with a
    // single partition scan each.
    const comments = await table(TABLES.comments);
    for (const row of await collect<TableEntity<object>>(
      TABLES.comments,
      odata`PartitionKey eq ${id}`,
    )) {
      await comments.deleteEntity(row.partitionKey, row.rowKey);
    }

    const likes = await table(TABLES.likes);
    for (const row of await collect<TableEntity<object>>(
      TABLES.likes,
      odata`PartitionKey eq ${id}`,
    )) {
      await likes.deleteEntity(row.partitionKey, row.rowKey);
    }

    return current;
  },

  async listComments(postId) {
    const rows = await collect<TableEntity<Omit<Comment, "id" | "postId">>>(
      TABLES.comments,
      postId ? odata`PartitionKey eq ${postId}` : undefined,
    );
    return rows
      .map((row) => ({
        id: row.rowKey,
        postId: row.partitionKey,
        visitorId: row.visitorId,
        nickname: row.nickname,
        text: row.text,
        createdAt: row.createdAt,
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  async addComment(comment) {
    const client = await table(TABLES.comments);
    await client.createEntity({
      partitionKey: comment.postId,
      rowKey: comment.id,
      visitorId: comment.visitorId,
      nickname: comment.nickname,
      text: comment.text,
      createdAt: comment.createdAt,
    });
    return comment;
  },

  async deleteComment(id) {
    // Comments are keyed by post, so a delete by id alone needs a lookup first.
    const rows = await collect<TableEntity<object>>(TABLES.comments, odata`RowKey eq ${id}`);
    if (rows.length === 0) return false;
    const client = await table(TABLES.comments);
    await client.deleteEntity(rows[0].partitionKey, rows[0].rowKey);
    return true;
  },

  async listLikes(postId) {
    const rows = await collect<TableEntity<{ nickname: string; createdAt: string }>>(
      TABLES.likes,
      postId ? odata`PartitionKey eq ${postId}` : undefined,
    );
    return rows.map((row) => ({
      postId: row.partitionKey,
      visitorId: row.rowKey,
      nickname: row.nickname,
      createdAt: row.createdAt,
    }));
  },

  async toggleLike(like) {
    const client = await table(TABLES.likes);
    const existing = await findOne<TableEntity<object>>(
      TABLES.likes,
      like.postId,
      like.visitorId,
    );

    let liked: boolean;
    if (existing) {
      await client.deleteEntity(like.postId, like.visitorId);
      liked = false;
    } else {
      await client.upsertEntity(
        {
          partitionKey: like.postId,
          rowKey: like.visitorId,
          nickname: like.nickname,
          createdAt: like.createdAt,
        },
        "Replace",
      );
      liked = true;
    }

    const count = (await this.listLikes(like.postId)).length;
    return { liked, count };
  },

  async listVisitors() {
    const rows = await collect<VisitorEntity>(TABLES.visitors);
    return rows
      .map(toVisitor)
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  },

  async getVisitor(id) {
    const entity = await findOne<VisitorEntity>(TABLES.visitors, "visitor", id);
    return entity ? toVisitor(entity) : null;
  },

  async findVisitorByCode(nickname, code) {
    const wanted = nickname.trim().toLowerCase();
    const trimmed = code.trim();
    const rows = await collect<VisitorEntity>(
      TABLES.visitors,
      odata`nicknameLower eq ${wanted} and code eq ${trimmed}`,
    );
    return rows.length > 0 ? toVisitor(rows[0]) : null;
  },

  async requestCodeReset(nickname, email) {
    const wanted = nickname.trim().toLowerCase();
    const rows = await collect<VisitorEntity>(
      TABLES.visitors,
      odata`nicknameLower eq ${wanted}`,
    );
    if (rows.length === 0) return null;

    const current = toVisitor(rows[0]);
    const supplied = email.trim();

    const next: Visitor = {
      ...current,
      // Someone who never left an address has now given one — keep it, so the
      // owner can reach them about future posts and not just this one code.
      // An address already on file is never overwritten: anyone can type
      // anyone's nickname into that box, so a claim is not proof.
      email: current.email || supplied,
      codeResetRequestedAt: new Date().toISOString(),
      codeResetEmail: supplied,
    };
    const client = await table(TABLES.visitors);
    await client.upsertEntity(fromVisitor(next), "Replace");
    return next;
  },

  async regenerateCode(id) {
    const existing = await this.getVisitor(id);
    if (!existing) return null;

    const taken = new Set(
      (await this.listVisitors()).filter((v) => v.id !== id).map((v) => v.code),
    );
    const next: Visitor = {
      ...existing,
      code: mintCode(taken),
      codeResetRequestedAt: "",
      codeResetEmail: "",
    };
    const client = await table(TABLES.visitors);
    await client.upsertEntity(fromVisitor(next), "Replace");
    return next;
  },

  async deleteVisitor(id) {
    const existing = await this.getVisitor(id);
    if (!existing) return null;

    const visitors = await table(TABLES.visitors);
    await visitors.deleteEntity("visitor", id);

    // Comments are partitioned by post and likes are keyed by visitor within
    // each post, so both need a scan by visitorId rather than a partition read.
    const comments = await table(TABLES.comments);
    for (const row of await collect<TableEntity<{ visitorId: string }>>(
      TABLES.comments,
      odata`visitorId eq ${id}`,
    )) {
      await comments.deleteEntity(row.partitionKey, row.rowKey);
    }

    const likes = await table(TABLES.likes);
    for (const row of await collect<TableEntity<object>>(TABLES.likes, odata`RowKey eq ${id}`)) {
      await likes.deleteEntity(row.partitionKey, row.rowKey);
    }

    return existing;
  },

  async upsertVisitor(visitor) {
    const existing = await this.getVisitor(visitor.id);

    let code = existing?.code || visitor.code;
    if (!code) {
      const taken = new Set((await this.listVisitors()).map((v) => v.code).filter(Boolean));
      code = mintCode(taken);
    }

    const next: Visitor = {
      ...visitor,
      code,
      animal: visitor.animal || existing?.animal || randomAnimalKey(),
      avatar: visitor.avatar ?? existing?.avatar ?? null,
      firstSeenAt: existing?.firstSeenAt ?? visitor.firstSeenAt,
    };

    const client = await table(TABLES.visitors);
    await client.upsertEntity(fromVisitor(next), "Replace");
    return next;
  },
};
