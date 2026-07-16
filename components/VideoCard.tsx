"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* hls.js pinned + SRI. Hash computed from these exact bytes, not copied from
   docs. `hls.light` drops DRM/subtitles/alt-audio we do not use — 345KB vs
   528KB, and it only ever loads after a tap. */
const HLS_VERSION = "1.6.13";
const HLS_SRC = `https://cdnjs.cloudflare.com/ajax/libs/hls.js/${HLS_VERSION}/hls.light.min.js`;
const HLS_SRI =
  "sha384-6zVopFZ6MnadnshQ07Vs8phFH+j+4/Ug+8qEZUIrwOiEv3+rW6ndNweevq1hUH93";

/** Fires when any card starts, so every other card can pause itself. */
const PLAY_EVENT = "epa:play";

type HlsCtor = new (config?: unknown) => HlsInstance;
type HlsInstance = {
  loadSource: (url: string) => void;
  attachMedia: (el: HTMLVideoElement) => void;
  destroy: () => void;
  on: (event: string, cb: (evt: string, data: { fatal?: boolean }) => void) => void;
  /** -1 = uncapped. capLevelToPlayerSize drives this from the element's size. */
  autoLevelCapping: number;
};
type HlsStatic = HlsCtor & {
  isSupported: () => boolean;
  Events: { ERROR: string };
};

declare global {
  interface Window {
    Hls?: HlsStatic;
  }
}

let hlsPromise: Promise<HlsStatic | null> | null = null;

/** Injects the CDN script once per page, shared across both cards. */
function loadHls(): Promise<HlsStatic | null> {
  if (hlsPromise) return hlsPromise;
  hlsPromise = new Promise((resolve) => {
    if (window.Hls) return resolve(window.Hls);
    const script = document.createElement("script");
    script.src = HLS_SRC;
    script.integrity = HLS_SRI;
    script.crossOrigin = "anonymous";
    script.async = true;
    script.onload = () => resolve(window.Hls ?? null);
    script.onerror = () => resolve(null); // fall through to fallback.mp4
    document.head.appendChild(script);
  });
  return hlsPromise;
}

type Props = {
  slug: string;
  poster: string;
  title: string;
  /** First card paints immediately; later cards wait for IntersectionObserver. */
  eager?: boolean;
};

export default function VideoCard({ slug, poster, title, eager = false }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsInstance | null>(null);
  const cappingBeforeFullscreen = useRef<number | null>(null);

  const [posterVisible, setPosterVisible] = useState(eager);
  const [posterFailed, setPosterFailed] = useState(false);
  const [armed, setArmed] = useState(false); // <video> mounted at all?
  const [videoReady, setVideoReady] = useState(false); // first frame painted
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const masterUrl = `/videos/${slug}/master.m3u8`;
  const fallbackUrl = `/videos/${slug}/fallback.mp4`;

  /* The server-rendered poster can finish failing before React hydrates, so
     its onError never fires. Re-check load state the moment we get the node. */
  const posterRef = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth === 0) setPosterFailed(true);
  }, []);

  /* Card 2's poster stays undecoded until it is near the viewport. */
  useEffect(() => {
    if (eager || posterVisible) return;
    const node = cardRef.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      setPosterVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setPosterVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "250px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [eager, posterVisible]);

  /* Only one video plays at a time. */
  useEffect(() => {
    const onOtherPlay = (event: Event) => {
      const detail = (event as CustomEvent<{ slug: string }>).detail;
      if (detail?.slug !== slug) videoRef.current?.pause();
    };
    window.addEventListener(PLAY_EVENT, onOtherPlay);
    return () => window.removeEventListener(PLAY_EVENT, onOtherPlay);
  }, [slug]);

  /* Fullscreen wants the top rung. capLevelToPlayerSize keeps the cap low for
     the small card, so lift it entirely while fullscreen and put back whatever
     it was on exit. */
  useEffect(() => {
    const onFullscreenChange = () => {
      const hls = hlsRef.current;
      if (!hls) return;

      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      const isFullscreen = Boolean(
        document.fullscreenElement || doc.webkitFullscreenElement,
      );

      if (isFullscreen) {
        if (cappingBeforeFullscreen.current === null) {
          cappingBeforeFullscreen.current = hls.autoLevelCapping;
        }
        hls.autoLevelCapping = -1;
      } else if (cappingBeforeFullscreen.current !== null) {
        hls.autoLevelCapping = cappingBeforeFullscreen.current;
        cappingBeforeFullscreen.current = null;
      }
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
    };
  }, []);

  /* Source attach happens only once the user has asked for the video. */
  useEffect(() => {
    if (!armed) return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    const useFallback = () => {
      if (cancelled) return;
      if (video.src.endsWith("fallback.mp4")) return; // already degraded
      hlsRef.current?.destroy();
      hlsRef.current = null;
      video.src = fallbackUrl;
      void video.play().catch(() => {});
    };

    const attach = async () => {
      /* Safari/iOS play HLS natively, and loading hls.js there is wasted bytes.
         But canPlayType() alone is NOT a safe test: Chromium answers "maybe"
         for application/vnd.apple.mpegurl while having no native HLS on
         desktop. Trusting it sends every Chrome user straight to the fat
         progressive fallback.mp4 and silently kills adaptive bitrate.
         navigator.vendor is "Apple Computer, Inc." on Safari and on every iOS
         browser (all WebKit), and "Google Inc." on Chromium — pairing the two
         gets native only where it is real. */
      const nativeHls = Boolean(video.canPlayType("application/vnd.apple.mpegurl"));
      const appleWebkit = /apple/i.test(navigator.vendor || "");

      if (nativeHls && appleWebkit) {
        video.src = masterUrl;
        video.addEventListener("error", useFallback, { once: true });
        void video.play().catch(() => {});
        return;
      }

      const Hls = await loadHls();
      if (cancelled) return;

      if (Hls && Hls.isSupported()) {
        /* The card is ~335px wide; pulling the 480x854 rung for it wastes
           bandwidth we do not have. capLevelToPlayerSize picks a rung to suit
           the element, and the fullscreenchange handler below lifts the cap so
           going fullscreen is not stuck on a low rung. */
        const hls = new Hls({ capLevelToPlayerSize: true });
        hlsRef.current = hls;
        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (data?.fatal) useFallback();
        });
        hls.loadSource(masterUrl);
        hls.attachMedia(video);
        void video.play().catch(() => {});
        return;
      }

      // hls.js unavailable (CDN blocked, or no MSE): last chance at native
      // before dropping to the progressive file.
      if (nativeHls) {
        video.src = masterUrl;
        video.addEventListener("error", useFallback, { once: true });
        void video.play().catch(() => {});
        return;
      }

      useFallback();
    };

    void attach();

    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [armed, masterUrl, fallbackUrl]);

  const start = useCallback(() => {
    window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: { slug } }));
    if (!armed) {
      setArmed(true);
      return; // the effect above attaches a source and plays
    }
    void videoRef.current?.play().catch(() => {});
  }, [armed, slug]);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return start();
    if (video.paused) start();
    else video.pause();
  }, [start]);

  const toggleFullscreen = useCallback(() => {
    const card = cardRef.current;
    const video = videoRef.current as
      | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
      | null;
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => void;
    };

    if (document.fullscreenElement || doc.webkitFullscreenElement) {
      if (document.exitFullscreen) void document.exitFullscreen();
      else doc.webkitExitFullscreen?.();
      return;
    }

    const target = card as
      | (HTMLDivElement & { webkitRequestFullscreen?: () => void })
      | null;

    if (target?.requestFullscreen) void target.requestFullscreen().catch(() => {});
    else if (target?.webkitRequestFullscreen) target.webkitRequestFullscreen();
    // iOS Safari refuses fullscreen on containers; only the video element works.
    else video?.webkitEnterFullscreen?.();
  }, []);

  return (
    <div className="relative">
      <div className="epa-glow" aria-hidden="true" />

      <div
        ref={cardRef}
        className="epa-card relative z-10 aspect-[9/16] w-full overflow-hidden rounded-3xl bg-black"
      >
        {/* Poster. Cross-fades out as the video fades in — no hard cut.
            A missing poster unmounts to plain black rather than leaving the
            browser's broken-image glyph on the card. */}
        {posterVisible && !posterFailed && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={posterRef}
            src={`/${poster}`}
            alt=""
            width={1080}
            height={1920}
            decoding="async"
            loading={eager ? "eager" : "lazy"}
            fetchPriority={eager ? "high" : "auto"}
            onError={() => setPosterFailed(true)}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ease-out ${
              videoReady ? "opacity-0" : "opacity-100"
            }`}
          />
        )}

        {armed && (
          <video
            ref={videoRef}
            playsInline
            preload="none"
            /* `contain`, not `cover`. The card and the source are both 9:16 so
               cover gains nothing here, but in the 16:9 fullscreen container it
               zooms the portrait video to fill the width — cropping top and
               bottom and upscaling ~3x into a blurry mess. Contain pillarboxes
               instead, which is correct for vertical video. */
            className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-500 ease-out ${
              videoReady ? "opacity-100" : "opacity-0"
            }`}
            onPlaying={() => {
              setVideoReady(true);
              setPlaying(true);
            }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => {
              setPlaying(false);
              setProgress(0);
            }}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration > 0) setProgress(v.currentTime / v.duration);
            }}
          />
        )}

        {/* Tap anywhere to toggle. Only exists once there is something to toggle. */}
        {armed && (
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? "Videoni to'xtatish" : "Videoni ijro etish"}
            className="absolute inset-0 z-10 cursor-pointer bg-transparent"
          />
        )}

        {/* Primary play control. */}
        {!playing && (
          <button
            type="button"
            onClick={start}
            aria-label={`Videoni ijro etish: ${title}`}
            className="epa-breathe absolute top-1/2 left-1/2 z-20 flex h-18 w-18 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-epa-red transition-transform duration-100 active:scale-[0.94]"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="ml-1 h-7 w-7 fill-white"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        )}

        {/* Fullscreen. Appears once playback has started, and on hover. */}
        {armed && (
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label="Butun ekran"
            className={`epa-spring absolute right-3 bottom-3 z-30 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm ${
              playing ? "opacity-100" : "opacity-0 focus-visible:opacity-100"
            } group-hover:opacity-100 hover:opacity-100`}
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="M9 3H3v6M21 9V3h-6M15 21h6v-6M3 15v6h6" />
              <path d="M3 3l6 6M21 3l-6 6M21 21l-6-6M3 21l6-6" />
            </svg>
          </button>
        )}

        {/* Progress. No volume, no timestamps. */}
        {armed && (
          <div
            aria-hidden="true"
            className="absolute right-0 bottom-0 left-0 z-30 h-[2px] bg-white/10"
          >
            <div
              className="h-full bg-epa-red transition-[width] duration-150 ease-linear"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
