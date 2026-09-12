import AnimalAvatar from "./AnimalAvatar";
import { mediaUrl } from "@/lib/mediaUrl";
import type { MediaAsset } from "@/lib/types";

const SIZES = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-11 w-11 text-sm",
  xl: "h-20 w-20 text-2xl md:h-[150px] md:w-[150px] md:text-5xl",
} as const;

export default function Avatar({
  asset,
  name,
  animal,
  size = "md",
  ring = false,
}: {
  asset: MediaAsset | null;
  name: string;
  /** Fallback animal icon when there is no uploaded photo. */
  animal?: string | null;
  size?: keyof typeof SIZES;
  ring?: boolean;
}) {
  const inner = asset ? (
    <img
      src={mediaUrl(asset.thumbKey)}
      alt={name}
      className="h-full w-full rounded-full object-cover"
    />
  ) : animal ? (
    <div className="h-full w-full overflow-hidden rounded-full bg-button">
      <AnimalAvatar animal={animal} seed={name} />
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center rounded-full bg-button font-semibold text-muted uppercase">
      {name.trim().charAt(0) || "?"}
    </div>
  );

  if (!ring) {
    return <div className={`${SIZES[size]} shrink-0 overflow-hidden rounded-full`}>{inner}</div>;
  }

  return (
    <div className={`story-ring ${SIZES[size]} shrink-0 rounded-full p-[2px]`}>
      <div className="h-full w-full rounded-full bg-bg p-[2px]">{inner}</div>
    </div>
  );
}
