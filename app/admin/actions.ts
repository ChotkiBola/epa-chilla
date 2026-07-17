"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  SESSION_COOKIE,
  checkPassword,
  clearFailures,
  isAuthed,
  issueToken,
  rateLimit,
  recordFailure,
} from "@/lib/auth";
import { commitSiteConfig, type PosterUpload } from "@/lib/github";
import type { SiteConfig, VideoEntry } from "@/lib/config";
import { videoSlugs } from "@/lib/videos";
import { listBunnyVideos } from "@/lib/bunny";

export type LoginState = { error?: string };
export type SaveState = { status: "idle" | "deploying" | "error"; message?: string };

/** 3 MB. Base64 inflates by ~33% and the function body cap is 4.5 MB. */
const MAX_POSTER_BYTES = 3 * 1024 * 1024;

const POSTER_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

async function clientKey(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const key = await clientKey();
  const gate = rateLimit(key);
  if (!gate.ok) {
    return {
      error: `Juda ko'p urinish. ${gate.retryInMin} daqiqadan so'ng qayta urinib ko'ring.`,
    };
  }

  const password = String(formData.get("password") ?? "");
  if (!checkPassword(password)) {
    recordFailure(key);
    return { error: "Parol noto'g'ri." };
  }

  clearFailures(key);
  const store = await cookies();
  store.set(SESSION_COOKIE, issueToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: 12 * 60 * 60,
  });
  return {};
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  revalidatePath("/admin");
}

export async function saveConfig(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  // Server Actions are public endpoints — re-check auth here, not just in the page.
  if (!(await isAuthed())) {
    return { status: "error", message: "Sessiya tugadi. Qaytadan kiring." };
  }

  const count = Number(formData.get("count") ?? 0);
  if (!Number.isInteger(count) || count < 1 || count > 8) {
    return { status: "error", message: "Ma'lumot noto'g'ri." };
  }

  const videos: VideoEntry[] = [];
  const posters: PosterUpload[] = [];

  /* One API call per save, then every submitted Bunny id is checked against
     it — the dropdown is the only source we trust, never free text. */
  const bunnyByGuid = new Map(
    (await listBunnyVideos()).map((b) => [b.guid, b]),
  );

  for (let i = 0; i < count; i++) {
    const title = String(formData.get(`title-${i}`) ?? "").trim();
    const selection = String(formData.get(`selection-${i}`) ?? "").trim();
    let poster = String(formData.get(`poster-current-${i}`) ?? "").trim();

    if (!title) {
      return { status: "error", message: `${i + 1}-video: sarlavha bo'sh bo'lishi mumkin emas.` };
    }

    if (selection.startsWith("bunny:")) {
      const guid = selection.slice(6);
      const bunny = bunnyByGuid.get(guid);
      if (!bunny) {
        return { status: "error", message: `${i + 1}-video: video tanlanmagan.` };
      }
      videos.push({ title, bunnyId: bunny.guid, thumb: bunny.thumb });
      continue;
    }

    const slug = selection.startsWith("local:") ? selection.slice(6) : "";
    // Only ever accept a slug we enumerated ourselves — never free text.
    if (!videoSlugs.includes(slug)) {
      return { status: "error", message: `${i + 1}-video: video tanlanmagan.` };
    }

    const file = formData.get(`poster-file-${i}`);
    if (file instanceof File && file.size > 0) {
      const ext = POSTER_TYPES[file.type];
      if (!ext) {
        return {
          status: "error",
          message: `${i + 1}-video: rasm formati JPG, PNG yoki WEBP bo'lishi kerak.`,
        };
      }
      if (file.size > MAX_POSTER_BYTES) {
        const mb = (file.size / 1024 / 1024).toFixed(1);
        return {
          status: "error",
          message: `${i + 1}-video: rasm juda katta (${mb} MB). Eng ko'pi 3 MB.`,
        };
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      poster = `posters/${slug}.${ext}`;
      posters.push({
        path: `public/${poster}`,
        contentBase64: buffer.toString("base64"),
      });
    }

    if (!poster) {
      return { status: "error", message: `${i + 1}-video: rasm tanlanmagan.` };
    }

    videos.push({ title, slug, poster });
  }

  const config: SiteConfig = { videos };

  try {
    await commitSiteConfig(config, posters);
  } catch (error) {
    console.error("[admin] commit failed", error);
    return {
      status: "error",
      message: "Saqlashda xatolik. Qaytadan urinib ko'ring.",
    };
  }

  return { status: "deploying" };
}
