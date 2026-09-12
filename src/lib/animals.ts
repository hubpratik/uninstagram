/**
 * The default profile icons. Rather than shipping a dozen hand-drawn files,
 * every animal is the same face template tinted and reshaped by a handful of
 * parameters — so they share a style, weigh nothing, and scale cleanly from a
 * 24px comment avatar to the 150px profile photo.
 */
export type AnimalSpec = {
  key: string;
  label: string;
  /** Main coat colour. */
  fur: string;
  /** Inner ear and shading. */
  shade: string;
  /** Muzzle / belly patch. Omit for a plain face. */
  muzzle?: string;
  nose: string;
  ear: "round" | "pointed" | "tall" | "side" | "none";
  /** Raccoon/panda style mask around the eyes. */
  mask?: string;
  /** Owl and penguin beaks. */
  beak?: string;
  /** Tiger stripes. */
  stripes?: string;
  cheek?: string;
};

export const ANIMALS: AnimalSpec[] = [
  { key: "fox", label: "Fox", fur: "#ef8f4a", shade: "#c96a2e", muzzle: "#fdf3e7", nose: "#3c2f2a", ear: "pointed", cheek: "#f6b98a" },
  { key: "cat", label: "Cat", fur: "#9aa4b0", shade: "#77828f", muzzle: "#eef2f6", nose: "#5b6673", ear: "pointed", cheek: "#c3ced9" },
  { key: "panda", label: "Panda", fur: "#f5f5f7", shade: "#2f2f35", muzzle: "#ffffff", nose: "#2f2f35", ear: "round", mask: "#2f2f35" },
  { key: "owl", label: "Owl", fur: "#b4794a", shade: "#8d5a34", muzzle: "#e8cba6", nose: "#f2b13a", ear: "none", beak: "#f2b13a", mask: "#e8cba6" },
  { key: "frog", label: "Frog", fur: "#6fbf62", shade: "#4d9642", muzzle: "#d8f0cf", nose: "#3f7a37", ear: "none", cheek: "#9ad78e" },
  { key: "bear", label: "Bear", fur: "#a9764f", shade: "#835836", muzzle: "#e3c9a9", nose: "#4a3524", ear: "round" },
  { key: "penguin", label: "Penguin", fur: "#3f4756", shade: "#2b313c", muzzle: "#f6f7f9", nose: "#f0a63c", ear: "none", beak: "#f0a63c" },
  { key: "koala", label: "Koala", fur: "#a3aab4", shade: "#848c97", muzzle: "#d9dee4", nose: "#4a4f57", ear: "round" },
  { key: "tiger", label: "Tiger", fur: "#f0a13c", shade: "#c97c22", muzzle: "#fdf0dc", nose: "#4a3524", ear: "round", stripes: "#5a4028" },
  { key: "rabbit", label: "Rabbit", fur: "#e9e0d7", shade: "#c9bcb0", muzzle: "#fffaf5", nose: "#e08a95", ear: "tall", cheek: "#f3c9cd" },
  { key: "dog", label: "Dog", fur: "#d9a066", shade: "#b07c46", muzzle: "#f6e5cf", nose: "#4a3524", ear: "side" },
  { key: "monkey", label: "Monkey", fur: "#a8734a", shade: "#835734", muzzle: "#e7c9a4", nose: "#5c4029", ear: "side", cheek: "#d19a6d" },
];

const BY_KEY = new Map(ANIMALS.map((animal) => [animal.key, animal]));

export function isAnimalKey(value: string | undefined): boolean {
  return Boolean(value && BY_KEY.has(value));
}

/**
 * Falls back to a stable pick rather than a random one, so a visitor whose
 * saved animal is somehow unknown still gets the same face every render.
 */
export function animalFor(key: string | undefined, seed = ""): AnimalSpec {
  if (key && BY_KEY.has(key)) return BY_KEY.get(key)!;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return ANIMALS[hash % ANIMALS.length];
}

export function randomAnimalKey(): string {
  return ANIMALS[Math.floor(Math.random() * ANIMALS.length)].key;
}
