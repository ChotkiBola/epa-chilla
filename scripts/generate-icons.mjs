/**
 * Rasterises public/brand/asset-2.svg into app/apple-icon.png.
 *
 * iOS ignores SVG favicons, so the apple-touch-icon has to be a real PNG.
 * The output is committed — this is a one-off, not part of the build. Re-run
 * it only if the brand mark changes:
 *
 *   node scripts/generate-icons.mjs
 *
 * The mark is flattened onto EPA red so iOS's own corner mask never exposes
 * transparent corners.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(root, "public", "brand", "asset-2.svg"));
const out = join(root, "app", "apple-icon.png");

await sharp(svg, { density: 512 })
  .resize(180, 180, { fit: "contain", background: "#e40614" })
  .flatten({ background: "#e40614" })
  .png()
  .toFile(out);

console.log(`[epa] wrote ${out} (180x180)`);
