import { animalFor } from "@/lib/animals";

/**
 * One SVG template, reshaped per animal. Everything is drawn in a 64x64 box and
 * scaled by the wrapper, so the same component serves a 24px comment avatar and
 * the 150px profile photo.
 */
export default function AnimalAvatar({
  animal,
  seed = "",
  className = "h-full w-full",
}: {
  animal: string | undefined;
  seed?: string;
  className?: string;
}) {
  const spec = animalFor(animal, seed);

  // Stagger the blink so a list of avatars does not wink in unison.
  let hash = 0;
  for (let i = 0; i < (seed || spec.key).length; i += 1) {
    hash = (hash * 31 + (seed || spec.key).charCodeAt(i)) >>> 0;
  }
  const delay = `${(hash % 40) / 10}s`;

  const eye = (cx: number) => (
    <ellipse
      cx={cx}
      cy={30}
      rx={3.4}
      ry={4}
      fill="#241d1a"
      className="animal-eye"
      style={{ animationDelay: delay }}
    />
  );

  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label={spec.label}>
      {/* Ears sit behind the head. */}
      {spec.ear === "pointed" && (
        <>
          <path d="M13 26 L15 6 L31 17 Z" fill={spec.fur} />
          <path d="M51 26 L49 6 L33 17 Z" fill={spec.fur} />
          <path d="M17 23 L18 12 L27 18 Z" fill={spec.shade} />
          <path d="M47 23 L46 12 L37 18 Z" fill={spec.shade} />
        </>
      )}
      {spec.ear === "round" && (
        <>
          <circle cx={14} cy={16} r={9} fill={spec.fur} />
          <circle cx={50} cy={16} r={9} fill={spec.fur} />
          <circle cx={14} cy={16} r={4.5} fill={spec.shade} />
          <circle cx={50} cy={16} r={4.5} fill={spec.shade} />
        </>
      )}
      {spec.ear === "tall" && (
        <>
          <ellipse cx={22} cy={12} rx={5.5} ry={13} fill={spec.fur} />
          <ellipse cx={42} cy={12} rx={5.5} ry={13} fill={spec.fur} />
          <ellipse cx={22} cy={13} rx={2.6} ry={8.5} fill={spec.shade} />
          <ellipse cx={42} cy={13} rx={2.6} ry={8.5} fill={spec.shade} />
        </>
      )}
      {spec.ear === "side" && (
        <>
          <ellipse cx={10} cy={32} rx={6} ry={8} fill={spec.shade} />
          <ellipse cx={54} cy={32} rx={6} ry={8} fill={spec.shade} />
        </>
      )}

      <circle cx={32} cy={34} r={22} fill={spec.fur} />

      {spec.stripes && (
        <g fill={spec.stripes} opacity={0.85}>
          <path d="M32 12.5 l3.4 0 l-1.7 6 Z" />
          <path d="M28.6 12.5 l-3.4 0 l1.7 6 Z" />
          <path d="M12.5 30 l-1 4.5 l6 -1.4 Z" />
          <path d="M51.5 30 l1 4.5 l-6 -1.4 Z" />
        </g>
      )}

      {spec.mask &&
        (spec.key === "owl" ? (
          <>
            <circle cx={24} cy={30} r={10} fill={spec.mask} />
            <circle cx={40} cy={30} r={10} fill={spec.mask} />
          </>
        ) : (
          <>
            <ellipse cx={24} cy={30} rx={7.5} ry={8.5} fill={spec.mask} transform="rotate(-12 24 30)" />
            <ellipse cx={40} cy={30} rx={7.5} ry={8.5} fill={spec.mask} transform="rotate(12 40 30)" />
          </>
        ))}

      {spec.muzzle && !spec.beak && (
        <ellipse cx={32} cy={42} rx={11} ry={8} fill={spec.muzzle} />
      )}
      {spec.muzzle && spec.beak && spec.key === "penguin" && (
        <ellipse cx={32} cy={40} rx={13} ry={11} fill={spec.muzzle} />
      )}

      {eye(24)}
      {eye(40)}

      {spec.beak ? (
        <path d="M32 36 l5.5 5 l-5.5 5 l-5.5 -5 Z" fill={spec.beak} />
      ) : (
        <>
          <ellipse cx={32} cy={38.5} rx={3.6} ry={2.6} fill={spec.nose} />
          <path
            d="M32 41.5 v2.5 M32 44 q-3.5 2.6 -6.5 0 M32 44 q3.5 2.6 6.5 0"
            stroke={spec.nose}
            strokeWidth={1.5}
            strokeLinecap="round"
            fill="none"
          />
        </>
      )}

      {spec.cheek && (
        <>
          <ellipse cx={17} cy={39} rx={4} ry={2.6} fill={spec.cheek} opacity={0.75} />
          <ellipse cx={47} cy={39} rx={4} ry={2.6} fill={spec.cheek} opacity={0.75} />
        </>
      )}
    </svg>
  );
}
