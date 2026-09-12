import Avatar from "./Avatar";
import ProfileActions from "./ProfileActions";
import VisitorsStat from "./VisitorsStat";
import { GridIcon } from "./Icons";
import type { Profile } from "@/lib/types";

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span className="text-sm md:text-base">
      <strong className="font-semibold">{value.toLocaleString()}</strong>{" "}
      <span className="text-ink md:text-ink">{label}</span>
    </span>
  );
}

export default function ProfileHeader({
  profile,
  postCount,
  visitorCount,
  likeCount,
}: {
  profile: Profile;
  postCount: number;
  visitorCount: number;
  likeCount: number;
}) {
  return (
    <section className="px-4 pt-6 md:pt-10">
      <div className="flex gap-6 md:gap-20">
        <div className="shrink-0 md:pl-10">
          <Avatar asset={profile.avatar} name={profile.displayName || profile.username} size="xl" ring />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-5">
            <h1 className="text-xl font-normal">{profile.username}</h1>
            <ProfileActions profile={profile} />
          </div>

          {/* Desktop stats sit under the username; mobile gets its own bar below. */}
          <div className="mt-5 hidden gap-9 md:flex">
            <Stat value={postCount} label="posts" />
            <VisitorsStat count={visitorCount} layout="inline" />
            <Stat value={likeCount} label="likes" />
          </div>

          <div className="mt-5 hidden md:block">
            <p className="text-sm font-semibold">{profile.displayName}</p>
            {profile.bio && (
              <p className="whitespace-pre-line text-sm leading-[1.35rem]">{profile.bio}</p>
            )}
            {profile.link && (
              <a
                href={profile.link}
                target="_blank"
                rel="noreferrer noopener"
                className="text-sm font-semibold text-[#00376b] dark:text-[#e0f1ff]"
              >
                {profile.link.replace(/^https?:\/\//, "")}
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 md:hidden">
        <p className="text-sm font-semibold">{profile.displayName}</p>
        {profile.bio && <p className="whitespace-pre-line text-sm leading-[1.35rem]">{profile.bio}</p>}
        {profile.link && (
          <a
            href={profile.link}
            target="_blank"
            rel="noreferrer noopener"
            className="text-sm font-semibold text-[#00376b] dark:text-[#e0f1ff]"
          >
            {profile.link.replace(/^https?:\/\//, "")}
          </a>
        )}
      </div>

      <div className="mt-4 flex justify-around border-t border-line py-3 md:hidden">
        <div className="flex flex-col items-center text-sm">
          <strong className="font-semibold">{postCount.toLocaleString()}</strong>
          <span className="text-muted">posts</span>
        </div>
        <VisitorsStat count={visitorCount} layout="stacked" />
        <div className="flex flex-col items-center text-sm">
          <strong className="font-semibold">{likeCount.toLocaleString()}</strong>
          <span className="text-muted">likes</span>
        </div>
      </div>

      <div className="mt-6 hidden justify-center border-t border-line md:flex">
        <span className="-mt-px flex items-center gap-1.5 border-t border-ink py-4 text-xs font-semibold tracking-[0.08em] uppercase">
          <GridIcon />
          Posts
        </span>
      </div>
    </section>
  );
}
