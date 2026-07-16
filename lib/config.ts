import rawConfig from "@/config.json";

export type VideoEntry = {
  title: string;
  slug: string;
  poster: string;
};

export type SiteConfig = {
  videos: VideoEntry[];
};

/**
 * Baked-in last resort. If config.json is ever shaped wrong, the page
 * renders this instead of throwing. The page must never render broken.
 */
export const DEFAULT_CONFIG: SiteConfig = {
  videos: [
    {
      title: "Quruvchilarga g'amxo'rlik qiladi!",
      slug: "chilla-offer",
      poster: "posters/chilla-offer.jpg",
    },
    {
      title: "CORDLESS DRILL",
      slug: "placeholder-2",
      poster: "posters/placeholder-2.jpg",
    },
  ],
};

function isVideoEntry(value: unknown): value is VideoEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.title === "string" &&
    v.title.trim().length > 0 &&
    typeof v.slug === "string" &&
    // A slug becomes a URL path segment. Keep it boring so it can never
    // escape /videos/ or smuggle in a protocol.
    /^[a-z0-9][a-z0-9-]*$/i.test(v.slug) &&
    typeof v.poster === "string" &&
    v.poster.trim().length > 0 &&
    !v.poster.includes("..")
  );
}

export function parseConfig(input: unknown): SiteConfig {
  if (typeof input !== "object" || input === null) return DEFAULT_CONFIG;
  const videos = (input as Record<string, unknown>).videos;
  if (!Array.isArray(videos)) return DEFAULT_CONFIG;

  const valid = videos.filter(isVideoEntry);
  if (valid.length === 0) return DEFAULT_CONFIG;

  return { videos: valid };
}

/**
 * Imported at build time (resolveJsonModule). Validated at module load so a
 * hand-edited or half-committed config degrades to DEFAULT_CONFIG rather
 * than taking the page down.
 */
export const siteConfig: SiteConfig = parseConfig(rawConfig);
