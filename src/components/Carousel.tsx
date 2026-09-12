"use client";

import { useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "./Icons";
import { mediaUrl } from "@/lib/mediaUrl";
import type { MediaAsset } from "@/lib/types";

export default function Carousel({
  media,
  alt,
  onDoubleTap,
  fill = false,
}: {
  media: MediaAsset[];
  alt: string;
  onDoubleTap?: () => void;
  fill?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  function go(next: number) {
    const clamped = Math.max(0, Math.min(media.length - 1, next));
    setIndex(clamped);
    trackRef.current?.scrollTo({ left: clamped * trackRef.current.clientWidth, behavior: "smooth" });
  }

  return (
    <div className="relative h-full w-full select-none bg-black">
      <div
        ref={trackRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          const next = Math.round(el.scrollLeft / el.clientWidth);
          if (next !== index) setIndex(next);
        }}
        onDoubleClick={onDoubleTap}
        className="no-scrollbar flex h-full w-full snap-x snap-mandatory overflow-x-auto"
      >
        {media.map((asset) => (
          // No h-full here on purpose. `height: 100%` resolves to auto against an
          // indefinite parent, and because the computed value is not `auto`,
          // flexbox skips its default stretch too — so the slide collapsed to the
          // image's natural height and sat at the top of the frame, putting all the
          // letterbox black underneath. Letting it stretch centres the photo.
          <div
            key={asset.key}
            className="flex w-full shrink-0 snap-center items-center justify-center"
          >
            <img
              src={mediaUrl(asset.key)}
              alt={alt}
              className={fill ? "h-full w-full object-contain" : "max-h-full w-full object-contain"}
            />
          </div>
        ))}
      </div>

      {media.length > 1 && (
        <>
          {index > 0 && (
            <button
              onClick={() => go(index - 1)}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-1 text-black transition hover:bg-white"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
          )}
          {index < media.length - 1 && (
            <button
              onClick={() => go(index + 1)}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-1 text-black transition hover:bg-white"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          )}
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {media.map((asset, i) => (
              <span
                key={asset.key}
                className={`h-1.5 w-1.5 rounded-full transition ${
                  i === index ? "bg-brand" : "bg-white/50"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
