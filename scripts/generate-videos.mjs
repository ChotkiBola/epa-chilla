/**
 * Scans public/videos/ and public/posters/ and freezes the result into
 * lib/videos.generated.json.
 *
 * Why a generated file instead of calling fs.readdirSync from the admin page:
 * /admin reads a cookie, so it is a dynamic route and its code runs inside a
 * Vercel function at request time. Files under public/ are served by the CDN
 * and are NOT guaranteed to sit on the function's filesystem, so a runtime
 * readdirSync would return an empty list in production while working fine
 * locally. Scanning at build time (this script, wired to prebuild/predev)
 * keeps the "enumerated at build time" contract and actually works deployed.
 *
 * Run automatically by `npm run dev` and `npm run build`.
 */
import { readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const videosDir = join(root, "public", "videos");
const postersDir = join(root, "public", "posters");
const outFile = join(root, "lib", "videos.generated.json");

const POSTER_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

/** Folder names under public/videos/ — one per video. */
let slugs = [];
if (existsSync(videosDir)) {
  slugs = readdirSync(videosDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith("."))
    .sort();
}

/**
 * slug -> poster path, by filename convention (posters/<slug>.jpg).
 * Lets the admin swap a video and show the right thumbnail without guessing
 * an extension in the browser.
 */
const posters = {};
if (existsSync(postersDir)) {
  for (const entry of readdirSync(postersDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const ext = extname(entry.name).toLowerCase();
    if (!POSTER_EXTS.has(ext)) continue;
    posters[basename(entry.name, ext)] = `posters/${entry.name}`;
  }
}

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify({ slugs, posters }, null, 2) + "\n", "utf8");

console.log(
  `[epa] manifest: ${slugs.length} video(s) [${slugs.join(", ") || "none"}], ` +
    `${Object.keys(posters).length} poster(s)`,
);
