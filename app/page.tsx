import { Fragment } from "react";
import VideoCard from "@/components/VideoCard";
import Embers from "@/components/Embers";
import { siteConfig } from "@/lib/config";

/* Reveal order, 80ms apart:
   banner → headline 1 → card 1 → divider → headline 2 → card 2 → footer */
const STEP_MS = 80;
const delay = (step: number) => ({ "--epa-delay": `${step * STEP_MS}ms` }) as React.CSSProperties;

/* Grid placement for the lg row. Static strings — Tailwind cannot see
   interpolated class names. */
const COL = ["lg:col-start-1", "lg:col-start-2"];

export default function Page() {
  const { videos } = siteConfig;
  const footerStep = videos.length * 3;

  /* The side-by-side row is designed for exactly two cards. Any other count
     falls back to the stacked column rather than colliding in the grid. */
  const isPair = videos.length === 2;

  return (
    <>
      <Embers />

      <main className="relative z-10 mx-auto flex w-full max-w-[480px] flex-1 flex-col items-center px-5 pt-14 pb-10 sm:pt-20 lg:max-w-[1040px] lg:px-10 lg:pt-12 lg:pb-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/asset-1.svg"
          alt="EPA"
          width={224}
          height={60}
          className="epa-rise h-auto w-[58%] max-w-[300px] lg:w-[220px]"
          style={delay(0)}
        />

        {/* Mobile: one column, divider between. lg: two columns — headlines on
            row 1 (bottom-aligned so each hugs its card), cards on row 2 (so
            their tops line up regardless of headline length). */}
        <div
          className={
            isPair
              ? /* Tracks are pinned to --epa-card-w (see globals.css) so the
                   column never outgrows the card — that slack is what widens
                   the gutter past the 56px gap. */
                "epa-pair flex w-full flex-col items-center lg:grid lg:grid-cols-[repeat(2,var(--epa-card-w))] lg:grid-rows-[auto_auto] lg:items-end lg:justify-center lg:gap-x-14"
              : "flex w-full flex-col items-center"
          }
        >
          {videos.map((video, i) => {
            const isFirst = i === 0;
            const Heading = isFirst ? "h1" : "h2";
            const col = isPair ? COL[i] : "";

            return (
              <Fragment key={video.slug}>
                {/* The rule separated two stacked videos. In a row it has no
                    job, so it is gone above lg. */}
                {!isFirst && (
                  <div
                    aria-hidden="true"
                    className="epa-rise mt-14 mb-14 h-px w-[60px] bg-epa-red shadow-[0_0_8px_rgba(228,6,20,0.55)] lg:hidden"
                    style={delay(3 * i)}
                  />
                )}

                <Heading
                  className={`epa-rise epa-display mt-12 text-center text-[clamp(1.6rem,7vw,2.25rem)] text-white lg:mt-0 ${
                    isFirst ? "epa-underline" : ""
                  } ${col} lg:row-start-1 lg:self-end`}
                  style={delay(3 * i + 1)}
                >
                  {video.title}
                </Heading>

                <div
                  className={`epa-rise mt-8 w-full lg:mt-6 lg:w-[var(--epa-card-w)] lg:justify-self-center ${col} lg:row-start-2`}
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
        </div>

        <footer
          className="epa-rise mt-16 flex flex-col items-center gap-3 lg:mt-8"
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
    </>
  );
}
