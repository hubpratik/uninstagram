export type MediaAsset = {
  key: string;
  thumbKey: string;
  width: number;
  height: number;
  mime: string;
  /** True once the white frame is burned in. Keeps the backfill idempotent. */
  framed?: boolean;
};

export type Profile = {
  username: string;
  displayName: string;
  bio: string;
  link: string;
  avatar: MediaAsset | null;
  updatedAt: string;
};

export type Post = {
  id: string;
  media: MediaAsset[];
  caption: string;
  location: string;
  commentsDisabled: boolean;
  /** When the memory happened (YYYY-MM-DD), entered by the owner on upload. */
  takenAt: string;
  /** When it was posted here. Kept for the record; the UI shows takenAt. */
  createdAt: string;
  updatedAt: string;
};

export type Comment = {
  id: string;
  postId: string;
  visitorId: string;
  nickname: string;
  text: string;
  createdAt: string;
};

export type Like = {
  postId: string;
  visitorId: string;
  nickname: string;
  createdAt: string;
};

export type Visitor = {
  id: string;
  nickname: string;
  email: string;
  /** 5-digit pass code. With their nickname, it gets them back in elsewhere. */
  code: string;
  /** Their own picture, if they uploaded one. */
  avatar: MediaAsset | null;
  /** Default icon, assigned at random on sign-up. Used when avatar is null. */
  animal: string;
  /** ISO time a "I lost my code" request was made, or "" if none is pending. */
  codeResetRequestedAt: string;
  /**
   * The email supplied with that request. Deliberately kept SEPARATE from the
   * visitor's own `email`: anyone can claim to be anyone here, so the owner must
   * be able to see that a request for "Riya" arrived from an address that is not
   * Riya's before deciding to issue a new code.
   */
  codeResetEmail: string;
  notify: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
};

/** A visitor plus what they have left behind, so removal can show its cost. */
export type VisitorWithActivity = Visitor & {
  commentCount: number;
  likeCount: number;
};

/** A post plus the derived bits every view needs. */
export type PostWithMeta = Post & {
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
};

/** A visitor as other visitors may see them: no email unless you are the owner. */
export type PublicVisitor = {
  id: string;
  nickname: string;
  lastSeenAt: string;
  avatar: MediaAsset | null;
  animal: string;
  /** Owner-only fields. Never populated for anyone else. */
  email?: string;
  code?: string;
};
