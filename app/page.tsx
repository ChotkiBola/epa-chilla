import { Fragment } from "react";
import VideoCard from "@/components/VideoCard";
import { siteConfig } from "@/lib/config";

/* Reveal order, 80ms apart:
   banner → headline 1 → card 1 → divider → headline 2 → card 2 → footer */
const STEP_MS = 80;
const delay = (step: number) => ({ "--epa-delay": `${step * STEP_MS}ms` }) as React.CSSProperties;

export default function Page() {
  const { videos } = siteConfig;
  const footerStep = videos.length * 3;

  return (
    /* Portrait 9:16 video does not want to be stretched, so the column stays
       mobile-shaped on desktop and the background bloom gets the room instead. */
    <main className="mx-auto flex w-full max-w-[480px] flex-1 flex-col items-center px-5 pt-14 pb-10 sm:pt-20">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/asset-1.svg"
        alt="EPA"
        width={224}
        height={60}
        className="epa-rise h-auto w-[58%] max-w-[300px]"
        style={delay(0)}
      />

      {videos.map((video, i) => {
        const isFirst = i === 0;
        const Heading = isFirst ? "h1" : "h2";

        return (
          <Fragment key={video.slug}>
            {!isFirst && (
              <div
                aria-hidden="true"
                className="epa-rise mt-14 mb-14 h-px w-[60px] bg-epa-red shadow-[0_0_8px_rgba(228,6,20,0.55)]"
                style={delay(3 * i)}
              />
            )}

            <Heading
              className={`epa-rise epa-display mt-12 text-center text-[clamp(1.6rem,7vw,2.25rem)] text-white ${
                isFirst ? "epa-underline" : ""
              }`}
              style={delay(3 * i + 1)}
            >
              {video.title}
            </Heading>

            <div
              className="epa-rise mt-8 w-full"
              style={delay(3 * i + 2)}
            >
              <VideoCard
                slug={video.slug}
                poster={video.poster}
                title={video.title}
                eager={isFirst}
              />
            </div>
          </Fragment>
        );
      })}

      <footer
        className="epa-rise mt-16 flex flex-col items-center gap-3"
        style={delay(footerStep)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/asset-2.svg"
          alt=""
          width={24}
          height={24}
          className="h-6 w-6 opacity-45"
        />
        <p className="text-xs text-white/40">
          © 2026 EPA ·{" "}
          <a
            href="https://epa.uz"
            className="underline-offset-4 transition-colors hover:text-white/70 hover:underline"
          >
            epa.uz
          </a>
        </p>
      </footer>
    </main>
  );
}
