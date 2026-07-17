import rawConfig from "@/config.json";

/**
 * One entry per video slot. Two shapes, told apart by which id field is set:
 *
 *   Bunny Stream (preferred): { title, bunnyId, thumb? }
 *     Played straight from Bunny's CDN; the thumbnail is whatever was picked
 *     in the Bunny panel. Nothing video-related lives in this repo.
 *
 *   Repo video (legacy):      { title, slug, poster }
 *     HLS ladder under public/videos/<slug>/, poster under public/posters/.
 *
 * Both keep working so half-migrated configs never take the page down.
 */
export type VideoEntry = {
  title: string;
  /** Bunny Stream video GUID. */
  bunnyId?: string;
  /** Thumbnail filename inside the Bunny video folder (default thumbnail.jpg). */
  thumb?: string;
  /** Folder name under public/videos/ (legacy repo videos). */
  slug?: string;
  /** Poster path relative to public/ (legacy repo videos). */
  poster?: string;
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

const GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A bare filename: no slashes, no traversal, one or more sane characters. */
const THUMB_RE = /^[\w][\w.-]*$/;

function isVideoEntry(value: unknown): value is VideoEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.title !== "string" || v.title.trim().length === 0) return false;

  // Bunny shape.
  if (typeof v.bunnyId === "string") {
    if (!GUID_RE.test(v.bunnyId)) return false;
    if (v.thumb !== undefined) {
      if (typeof v.thumb !== "string" || !THUMB_RE.test(v.thumb)) return false;
    }
    return true;
  }

  // Legacy repo shape.
  return (
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

/* ---------------------------------------------------------------------------
   Entry → concrete URLs. Server-side only (reads env at build/render).
   --------------------------------------------------------------------------- */

export type ResolvedVideo = {
  /** Stable identity for "only one plays at a time". */
  id: string;
  title: string;
  /** HLS playlist URL (absolute for Bunny, /videos/... for repo). */
  src: string;
  /** Progressive MP4 used when HLS cannot play. Null = no fallback exists. */
  fallbackSrc: string | null;
  /** Poster URL, ready for <img src>. */
  poster: string;
};

export function resolveVideo(entry: VideoEntry): ResolvedVideo {
  if (entry.bunnyId) {
    const host = process.env.BUNNY_CDN_HOST ?? "";
    const base = `https://${host}/${entry.bunnyId}`;
    return {
      id: `bunny:${entry.bunnyId}`,
      title: entry.title,
      src: `${base}/playlist.m3u8`,
      /* Served only if "MP4 Fallback" is enabled in the Bunny library
         settings (see README). If it 404s the player's error path already
         copes — a fallback URL that might not exist beats none at all. */
      fallbackSrc: `${base}/play_720p.mp4`,
      poster: `${base}/${entry.thumb || "thumbnail.jpg"}`,
    };
  }

  return {
    id: `local:${entry.slug}`,
    title: entry.title,
    src: `/videos/${entry.slug}/master.m3u8`,
    fallbackSrc: `/videos/${entry.slug}/fallback.mp4`,
    poster: `/${entry.poster}`,
  };
}
