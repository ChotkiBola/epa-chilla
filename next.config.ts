import type { NextConfig } from "next";

/* Repeat views and segment re-fetches should hit the CDN, not our bandwidth.
   Vercel keys its CDN cache per deployment, so a redeploy still serves fresh
   files even where we say `immutable`. */
const IMMUTABLE = "public, max-age=31536000, immutable";

const nextConfig: NextConfig = {
  /* Server Actions reject request bodies over 1 MB BEFORE the action runs —
     the admin's own 3 MB poster check never got a chance to fire, so any
     real phone photo failed with a generic error. 4 MB covers the 3 MB
     poster cap plus multipart overhead, and stays under Vercel's 4.5 MB
     function body limit. */
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },

  async headers() {
    return [
      {
        // HLS segments and the MP4 fallback never change in place —
        // a new video is a new slug.
        source: "/videos/:path*",
        headers: [{ key: "Cache-Control", value: IMMUTABLE }],
      },
      {
        // Posters CAN be overwritten in place from /admin, so let the browser
        // recheck occasionally while the CDN holds the file.
        source: "/posters/:path*",
        headers: [
          {
            key: "Cache-Control",
            value:
              "public, max-age=600, s-maxage=31536000, stale-while-revalidate=86400",
          },
        ],
      },
      {
        source: "/fonts/:path*",
        headers: [{ key: "Cache-Control", value: IMMUTABLE }],
      },
      {
        source: "/admin",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
