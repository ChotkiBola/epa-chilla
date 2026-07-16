"use client";

import { useActionState, useCallback, useState } from "react";
import { login, saveConfig, type LoginState, type SaveState } from "./actions";
import type { VideoEntry } from "@/lib/config";

const input =
  "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-white placeholder:text-white/30 focus:border-epa-red focus:outline-none";
const label = "mb-1.5 block text-sm font-medium text-white/70";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={action} className="w-full max-w-sm space-y-4">
      <div>
        <label className={label} htmlFor="password">
          Parol
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={input}
        />
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-epa-red">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full cursor-pointer rounded-lg bg-epa-red px-4 py-2.5 font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Tekshirilmoqda…" : "Kirish"}
      </button>
    </form>
  );
}

type Row = VideoEntry & { fileUrl: string };

/**
 * The whole point of the thumbnail is catching a wrong pick, so a missing
 * poster has to say so in words — a broken-image glyph reads as "site is
 * broken" to someone who is not a developer.
 */
/* Mounted with key={src}, so changing the poster remounts this and the failed
   state resets on its own — no effect needed to clear it. */
function PosterThumb({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);

  // An <img> can finish failing before React attaches onError.
  const ref = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth === 0) setFailed(true);
  }, []);

  return (
    <div className="flex h-24 w-[54px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/15 bg-black">
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={ref}
          src={src}
          alt=""
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="px-1 text-center text-[10px] leading-tight text-white/40">
          Rasm yo&apos;q
        </span>
      )}
    </div>
  );
}

export function ConfigForm({
  videos,
  slugs,
  postersBySlug,
  logoutAction,
}: {
  videos: VideoEntry[];
  slugs: string[];
  postersBySlug: Record<string, string>;
  logoutAction: () => Promise<void>;
}) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveConfig, {
    status: "idle",
  });
  const [rows, setRows] = useState<Row[]>(
    videos.map((v) => ({ ...v, fileUrl: "" })),
  );

  const update = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  if (state.status === "deploying") {
    return (
      <div className="w-full max-w-lg rounded-xl border border-epa-red/40 bg-epa-red/10 p-5">
        <h2 className="epa-display mb-2 text-lg text-white">Saqlandi</h2>
        <p className="text-sm leading-relaxed text-white/80">
          O&apos;zgarishlar saytga <strong>taxminan 1 daqiqada</strong> chiqadi.
          Hozir sahifani yangilasangiz, eski holatni ko&apos;rasiz — bu normal.
          Bir daqiqa kuting, so&apos;ng tekshiring.
        </p>
        <a
          href="/"
          className="mt-4 inline-block rounded-lg border border-white/20 px-4 py-2 text-sm text-white"
        >
          Saytni ochish
        </a>
      </div>
    );
  }

  return (
    <form action={action} className="w-full max-w-lg space-y-8">
      <input type="hidden" name="count" value={rows.length} />

      {rows.map((row, i) => {
        const preview = row.fileUrl || (row.poster ? `/${row.poster}` : "");

        return (
          <fieldset
            key={i}
            className="space-y-4 rounded-xl border border-white/10 p-4"
          >
            <legend className="px-2 text-sm font-semibold text-white/50">
              {i + 1}-video
            </legend>

            <div>
              <label className={label} htmlFor={`title-${i}`}>
                Sarlavha
              </label>
              <input
                id={`title-${i}`}
                name={`title-${i}`}
                value={row.title}
                onChange={(e) => update(i, { title: e.target.value })}
                required
                className={input}
              />
            </div>

            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className={label} htmlFor={`slug-${i}`}>
                  Video
                </label>
                <select
                  id={`slug-${i}`}
                  name={`slug-${i}`}
                  value={row.slug}
                  onChange={(e) =>
                    update(i, {
                      slug: e.target.value,
                      poster: postersBySlug[e.target.value] ?? "",
                      fileUrl: "",
                    })
                  }
                  className={input}
                >
                  {!slugs.includes(row.slug) && (
                    <option value={row.slug}>{row.slug} (topilmadi)</option>
                  )}
                  {slugs.map((slug) => (
                    <option key={slug} value={slug}>
                      {slug}
                    </option>
                  ))}
                </select>
              </div>

              {/* Thumbnail of what is actually going live — catches wrong picks. */}
              <PosterThumb key={preview} src={preview} />
            </div>

            <input type="hidden" name={`poster-current-${i}`} value={row.poster} />

            <div>
              <label className={label} htmlFor={`poster-file-${i}`}>
                Yangi rasm (ixtiyoriy · JPG/PNG/WEBP · 3 MB gacha)
              </label>
              <input
                id={`poster-file-${i}`}
                name={`poster-file-${i}`}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  update(i, { fileUrl: file ? URL.createObjectURL(file) : "" });
                }}
                className="w-full text-sm text-white/60 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white"
              />
            </div>
          </fieldset>
        );
      })}

      {state.status === "error" && state.message && (
        <p role="alert" className="text-sm text-epa-red">
          {state.message}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 cursor-pointer rounded-lg bg-epa-red px-4 py-3 font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Saqlanmoqda…" : "Saqlash"}
        </button>
        <button
          type="button"
          onClick={() => logoutAction()}
          className="cursor-pointer rounded-lg border border-white/20 px-4 py-3 text-sm text-white/70"
        >
          Chiqish
        </button>
      </div>
    </form>
  );
}
