# EPA — Chilla

One-page campaign landing reached by QR code, plus a small password-protected
admin for swapping the two headlines and the two videos.

The page's entire job: EPA banner → two videos, each with its own headline.
Mobile first — people open this on a phone, in the field, on 3G/4G.

---

## How this works (read this first)

There is **no database, no CMS, no object store, no auth library**. That is
deliberate.

- Videos are static files in `public/videos/`, served by Vercel's CDN.
- `config.json` in the repo holds the two headlines and which video each uses.
  It is imported at build time.
- `/admin` edits `config.json` by **committing to GitHub via the Contents API**.
  The commit triggers Vercel's auto-redeploy. That commit *is* the save.

Vercel's filesystem is read-only at runtime and its functions cap request
bodies at 4.5 MB, so config cannot be written to disk and large uploads cannot
be proxied. Committing to Git sidesteps both, costs nothing, and gives free
version history and rollback.

**Consequence worth knowing:** a save is not instant. It is a commit plus a
redeploy — roughly a minute. The admin says so in Uzbek after saving; do not
"fix" that message.

---

## Deployment

| | |
| ---------------- | ---------------------------------------------------- |
| Live             | https://epa-chilla.vercel.app                         |
| Repo             | https://github.com/ChotkiBola/epa-chilla (private)    |
| Vercel project   | `anvars-projects-d1b69023/epa-chilla` (Hobby)         |

The repo is connected to Vercel, so **every push to `main` redeploys** — which
is what makes `/admin` work at all.

**`vercel.json` pins `"framework": "nextjs"` — do not remove it.** The project
was first created with Framework Preset "Other", whose output directory is
"`public` if it exists". Vercel ran the Next.js build and then published the raw
`public/` folder as a static site: assets resolved at the root, but `/` and
`/admin` returned 404 and none of `next.config.ts`'s `headers()` applied. The
pin makes the preset irrelevant.

## Local setup

```bash
npm install
cp .env.example .env.local     # then fill in the values
npm run dev                    # http://localhost:3000
```

`npm run dev` and `npm run build` both run `scripts/generate-videos.mjs` first,
which scans `public/videos/` and `public/posters/` and writes
`lib/videos.generated.json`. That file is what populates the admin dropdowns.
**If you add a video folder while the dev server is running, restart it.**

| Script              | Does                                          |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Dev server (regenerates the manifest first)   |
| `npm run build`     | Production build (same)                       |
| `npm run videos`    | Regenerate the manifest by hand               |
| `npm run typecheck` | `tsc --noEmit`                                |

---

## Environment variables

All four live in `.env.local` locally, and in Vercel → Project → Settings →
Environment Variables in production. See [`.env.example`](.env.example).

| Variable          | What it is                                              |
| ----------------- | ------------------------------------------------------- |
| `ADMIN_PASSWORD`  | The only thing protecting `/admin`. Make it long.        |
| `GITHUB_TOKEN`    | Lets `/admin` commit. Without it, saving fails.          |
| `GITHUB_REPO`     | `owner/repository`, e.g. `epa-uz/epa-chilla`.            |
| `GITHUB_BRANCH`   | The branch Vercel deploys from — usually `main`.         |

### Creating the GitHub token

Use a **fine-grained** personal access token, not a classic one.

1. github.com → Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → **Generate new token**
2. **Repository access:** Only select repositories → this repo
3. **Permissions:** Repository permissions → **Contents → Read and write**
   That single permission is the whole requirement. Nothing else.
4. **Expiration:** set a calendar reminder. When it lapses, `/admin` still logs
   in but every save fails.

Changing `ADMIN_PASSWORD` immediately invalidates all existing admin sessions —
the session cookie is signed with it.

---

## Adding a new video

Videos are encoded **once** with ffmpeg and committed. There is no in-browser
encoding, no job queue, no server-side ffmpeg — out of scope, and it would blow
the function limits anyway.

### 1. Encode

One command does the ladder, the MP4 fallback and the poster:

```bash
./scripts/encode.sh master.mp4 my-new-video
```

The slug is lowercase and hyphenated — it becomes a URL path segment and the
folder name under `public/videos/`.

Renditions are **named by height**. From a 4K vertical master the default
(`MAXH=1280`) gives:

| Playlist    | Resolution | ~Bitrate  |
| ----------- | ---------- | --------- |
| `1280p.m3u8`| 720×1280   | 1800 kbps |
| `854p.m3u8` | 480×854    | 900 kbps  |
| `640p.m3u8` | 360×640    | 500 kbps  |

The script never upscales: a 854px master just produces the 854p and 640p
rungs. It also skips `-map a:0` entirely when the master has no audio track,
which otherwise fails the whole encode.

**On `MAXH`** — this is the bandwidth dial, and it is the single most
expensive decision in the project. Measured on an 80s clip, per full session
(both videos, top rung):

| `MAXH` | top rung | per view | per session | sessions before the 100 GB pause |
| ------ | -------- | -------- | ----------- | -------------------------------- |
| 1920   | 3800 kbps| ~37 MB   | ~74 MB      | **~1,400**                       |
| 1280   | 1800 kbps| ~18 MB   | ~35 MB      | **~2,900** ← default             |
| 854    | 900 kbps | ~9 MB    | ~18 MB      | **~5,700**                       |

`MAXH=1920` is visibly crisper and costs you half your campaign. The script
prints these numbers after every encode and warns when the session count drops
below ~2,000. Raise it only if you know the scan volume is low.

The poster is grabbed at **1 second, not frame 0** — clips that fade in from
white give a blank frame 0, which is exactly how `placeholder-2.jpg` shipped as
a white rectangle. Replace it by hand if you have a designed one; it is the
only thing that loads before a tap, so keep it well under 200 KB.

> The script's logic is tested (ladder, no-upscale, no-audio, naming), but the
> ffmpeg invocation itself has not been run here — ffmpeg is not installed on
> this machine. Check the first encode's output before trusting it blindly.

### 2. Commit and push

```bash
git add public/videos/$SLUG public/posters/$SLUG.jpg
git commit -m "feat: add $SLUG video"
git push
```

Vercel redeploys, the build re-scans `public/videos/`, and the new slug appears
in the `/admin` dropdown.

---

## Swapping a headline or a video from /admin

1. Go to `/<your-domain>/admin` and enter `ADMIN_PASSWORD`.
2. **Sarlavha** — the headline shown above that video.
3. **Video** — pick a folder that already exists under `public/videos/`.
   The thumbnail beside it shows the poster that will go live. If it says
   *"Rasm yo'q"*, that video has no poster — upload one.
4. **Yangi rasm** — optional poster replacement. JPG/PNG/WEBP, max 3 MB
   (it is base64-encoded into the commit, and the function body cap is 4.5 MB).
5. **Saqlash** → one commit → Vercel redeploys → live in about a minute.

If a save fails, the reason is in the Vercel function logs. The usual cause is
an expired `GITHUB_TOKEN`.

---

## Bandwidth

Vercel Hobby allows 100 GB/month. Past that the project pauses for 30 days —
no bill, but the printed QR codes keep pointing at a dead page.

### What the current videos actually cost

Both clips are ~71 s. Per **full** view of **one** video:

| Rung / file    | Bitrate    | Cost per full view |
| -------------- | ---------- | ------------------ |
| `854p` (top)   | ~1.0 Mbps  | **~9.0 MB**        |
| `640p`         | ~600 kbps  | ~5.4 MB            |
| `480p`         | ~365 kbps  | ~3.2 MB            |
| `fallback.mp4` | —          | ~10.1 MB           |

A visitor who watches **both** videos through on the top rung costs ~18 MB.
That is roughly **5,500–6,000 full sessions** before the 100 GB cap — and a
paused project means dead QR codes that are already printed.

Most phones on a decent connection will pull the top rung. If the campaign is
expected to exceed a few thousand scans, the lever with by far the best
return is **re-encoding the top rung lower** (or trimming the clips): the
posters, the CSS background and the JS are rounding errors next to video.
Watch Vercel → Usage in the first days after the QR goes out.

Everything that avoids shipping bytes is load-bearing, not polish:

- Nothing but the poster loads before a tap. `preload="none"`, and the
  `<video>` element and hls.js are created only on tap.
- hls.js is `hls.light` (345 KB, not 528 KB) from a CDN — so it does not count
  against our bandwidth at all — pinned with an SRI hash.
- Card 2's poster does not even decode until it is near the viewport.
- `/videos/*` and `/fonts/*` are immutable-cached; repeat views cost nothing.
- The background is pure CSS gradient. No texture image, no bytes.

Keep the 360p/480p rungs genuinely small. A vertical campaign clip does not
need a fat 1080p.

---

## Things you must supply

Media and fonts are **in**. What is left is credentials:

| What             | Where                 | Notes                     |
| ---------------- | --------------------- | ------------------------- |
| `ADMIN_PASSWORD` | `.env.local` + Vercel | Long and random.          |
| `GITHUB_TOKEN`   | `.env.local` + Vercel | Contents: Read and write. |
| `GITHUB_REPO`    | `.env.local` + Vercel | `owner/repository`.       |
| `GITHUB_BRANCH`  | `.env.local` + Vercel | Usually `main`.           |

Already in place: the brand font (`public/fonts/`), both HLS ladders and MP4
fallbacks (`public/videos/`), and both posters (`public/posters/`).

The page renders even without the credentials — it just cannot save from
`/admin`.

---

## Notes for whoever touches this next

- **NEVER delete a file under `/videos/` or `/fonts/` and then restore it at the
  same URL.** `next.config.ts` serves those paths with
  `Cache-Control: public, max-age=31536000, immutable`, and Next applies that
  header to **404 responses too**. Any browser that requests the URL while the
  file is missing caches the 404 as immutable — **for a year**. Restoring the
  file does not help: the server returns 200, the browser keeps serving its
  cached 404, and that visitor's page is broken until the entry expires.

  This is not hypothetical; it happened during the brief Bunny migration when
  the videos were deleted and put back. `immutable` is only safe because a new
  video is supposed to be a **new slug** — the URLs are never meant to be
  reused. If you ever must replace a video in place, give it a new slug so the
  URL changes, and update `config.json` to match.

- **`.gitattributes` matters.** HLS segments are `*.ts` — MPEG-TS, not
  TypeScript. It marks them binary so Git does not try to diff them.
  `tsconfig.json` excludes `public/` for the same reason. `*.sh` is pinned to
  LF: checked out with CRLF on Windows and run under bash, the shebang gains a
  trailing CR and the script dies with "bad interpreter".
- **Do not trust `canPlayType` for HLS.** Chromium answers `"maybe"` for
  `application/vnd.apple.mpegurl` while having no native HLS on desktop.
  `components/VideoCard.tsx` pairs it with a WebKit check; without that, every
  Chrome user silently drops to the progressive MP4 and adaptive bitrate dies.
- **The admin rate limit is in-memory**, so it is per serverless instance —
  a speed bump against casual guessing, not a lockout. The password length is
  what actually protects `/admin`.
- **`config.json` is validated at load** (`lib/config.ts`). A malformed entry
  degrades to a baked-in default rather than taking the page down.
- **`placeholder-2` is a byte-identical copy of `chilla-offer`** — same
  footage, and now the same poster too. Git stores identical blobs once, so
  the pair costs ~26 MB rather than 52 MB. The second card therefore looks and
  plays exactly like the first; its headline is still the mockup's placeholder
  `CORDLESS DRILL`. All of that is expected to be replaced by real video 2.

  The poster shipped for it (`placeholder-2.jpg`) was a blank white frame —
  almost certainly frame 0 of a clip that fades in from white. On this dark
  page that rendered as a white slab, so it was replaced with a copy of
  `chilla-offer.jpg`. **When real video-2 footage lands, do not grab frame 0
  for its poster** — seek a few seconds in.
