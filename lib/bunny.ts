import "server-only";

/**
 * Bunny Stream. Videos are uploaded and thumbnails picked in the Bunny panel;
 * this module only LISTS the library so /admin can offer a dropdown, and the
 * save action can verify a submitted id really exists.
 *
 * Playback needs no API key at all — the page just builds public CDN URLs:
 *   https://{BUNNY_CDN_HOST}/{guid}/playlist.m3u8       (HLS, adaptive)
 *   https://{BUNNY_CDN_HOST}/{guid}/{thumbnailFileName} (poster)
 *   https://{BUNNY_CDN_HOST}/{guid}/play_720p.mp4       (fallback, if the
 *     library has "MP4 Fallback" enabled — see README)
 */

const API = "https://video.bunnycdn.com";

export type BunnyVideo = {
  guid: string;
  title: string;
  /** e.g. "thumbnail.jpg" — whatever is picked in the Bunny panel. */
  thumb: string;
};

export function bunnyConfigured(): boolean {
  return Boolean(process.env.BUNNY_LIBRARY_ID && process.env.BUNNY_STREAM_API_KEY);
}

/** Public CDN host, e.g. vz-abc123-456.b-cdn.net. Safe to expose. */
export function bunnyCdnHost(): string {
  return process.env.BUNNY_CDN_HOST ?? "";
}

type RawVideo = {
  guid?: string;
  title?: string;
  status?: number;
  thumbnailFileName?: string;
};

/**
 * Finished videos in the library, newest first. Returns [] when Bunny is not
 * configured or the API errors — the admin then simply offers repo videos,
 * it never hard-fails over an optional integration.
 */
export async function listBunnyVideos(): Promise<BunnyVideo[]> {
  if (!bunnyConfigured()) return [];

  const libraryId = process.env.BUNNY_LIBRARY_ID!;
  const url = `${API}/library/${encodeURIComponent(libraryId)}/videos?page=1&itemsPerPage=100&orderBy=date`;

  try {
    const res = await fetch(url, {
      headers: {
        AccessKey: process.env.BUNNY_STREAM_API_KEY!,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[bunny] list failed (${res.status})`);
      return [];
    }

    const body = (await res.json()) as { items?: RawVideo[] };
    const items = Array.isArray(body.items) ? body.items : [];

    return items
      // 4 = finished. Anything still transcoding or errored has no playable
      // playlist yet and must not be selectable.
      .filter((v) => v.status === 4 && typeof v.guid === "string")
      .map((v) => ({
        guid: v.guid!,
        title: (v.title || v.guid!).trim(),
        thumb: v.thumbnailFileName || "thumbnail.jpg",
      }));
  } catch (error) {
    console.error("[bunny] list failed", error);
    return [];
  }
}
