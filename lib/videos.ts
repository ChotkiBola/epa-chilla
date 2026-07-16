import manifest from "./videos.generated.json";

/** Folder names under public/videos/, frozen at build time by scripts/generate-videos.mjs. */
export const videoSlugs: string[] = Array.isArray(manifest.slugs)
  ? manifest.slugs
  : [];

/** slug -> poster path (e.g. "chilla-offer" -> "posters/chilla-offer.jpg"). */
export const postersBySlug: Record<string, string> =
  manifest.posters && typeof manifest.posters === "object"
    ? (manifest.posters as Record<string, string>)
    : {};
