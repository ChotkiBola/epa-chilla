"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Drifting embers + (desktop) a cursor torch, on one canvas, one rAF loop.
 *
 * The page's job is to get two videos watched. This is atmosphere and must
 * never become the subject: sparse, slow, dim, and gone the moment someone
 * hits play. Welding sparks that lost their hurry — not stars, not bokeh.
 */

/* Sparse on purpose. If you can count them at a glance and it feels calm,
   that is the target. */
const COUNT_DESKTOP = 14;
const COUNT_MOBILE = 7;
const COUNT_WEAK = 6;

const PEAK_ALPHA = 0.25;
const MIN_CROSS_MS = 15_000;
const MAX_CROSS_MS = 25_000;

/* Brand red → warm orange → pale ember yellow. Never white. */
const EMBER_COLORS: Array<[number, number, number]> = [
  [228, 6, 20],
  [255, 106, 26],
  [255, 190, 110],
];

const TORCH_RADIUS = 400;
const TORCH_ALPHA = 0.06;
/* Per-frame approach rate at 60fps. Low enough that the pool visibly lags. */
const TORCH_EASE = 0.022;

type Particle = {
  x: number;
  y: number;
  life: number;
  dur: number;
  size: number;
  sprite: number;
  driftAmp: number;
  driftFreq: number;
  phase: number;
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Soft round sprite, pre-rendered once so the loop never builds gradients. */
function makeEmberSprite(rgb: [number, number, number]): HTMLCanvasElement {
  const r = 32;
  const c = document.createElement("canvas");
  c.width = c.height = r * 2;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  const [red, green, blue] = rgb;
  grad.addColorStop(0, `rgba(${red},${green},${blue},1)`);
  grad.addColorStop(0.25, `rgba(${red},${green},${blue},0.55)`);
  grad.addColorStop(1, `rgba(${red},${green},${blue},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, r * 2, r * 2);
  return c;
}

function makeTorchSprite(): HTMLCanvasElement {
  const r = TORCH_RADIUS;
  const c = document.createElement("canvas");
  c.width = c.height = r * 2;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, "rgba(255,90,30,1)");
  grad.addColorStop(0.5, "rgba(228,6,20,0.35)");
  grad.addColorStop(1, "rgba(228,6,20,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, r * 2, r * 2);
  return c;
}

export default function Embers() {
  const [enabled, setEnabled] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /* Decide once, on the client, whether this device gets the animation at all. */
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setEnabled(true);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const nav = navigator as Navigator & { deviceMemory?: number };
    const weak = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
    const isDesktop = window.matchMedia("(min-width: 64rem)").matches;
    const count = weak ? COUNT_WEAK : isDesktop ? COUNT_DESKTOP : COUNT_MOBILE;

    /* No cursor, no torch. A glow parked at the last tap reads as a bug. */
    const wantsTorch =
      isDesktop && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    const sprites = EMBER_COLORS.map(makeEmberSprite);
    const torch = wantsTorch ? makeTorchSprite() : null;

    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;

    /* Cap DPR at 2 — no 3x rendering on a flagship phone for fifteen dots. */
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS px
    };

    const spawn = (p: Particle, initial: boolean) => {
      p.x = rand(0, w);
      p.y = h + rand(0, 40);
      p.dur = rand(MIN_CROSS_MS, MAX_CROSS_MS);
      // Stagger the first generation so they do not rise as a rank.
      p.life = initial ? Math.random() * p.dur : 0;
      p.size = rand(1, 2);
      p.sprite = Math.floor(Math.random() * sprites.length);
      p.driftAmp = rand(8, 26);
      p.driftFreq = rand(0.00008, 0.00022);
      p.phase = Math.random() * Math.PI * 2;
    };

    resize();
    const particles: Particle[] = Array.from({ length: count }, () => {
      const p = {} as Particle;
      spawn(p, true);
      return p;
    });

    let torchX = w / 2;
    let torchY = h / 2;
    let torchTargetX = w / 2;
    let torchTargetY = h / 2;

    const onPointer = (e: PointerEvent) => {
      torchTargetX = e.clientX;
      torchTargetY = e.clientY;
    };

    const draw = (now: number) => {
      const dt = Math.min(now - last, 50); // clamp after a tab stall
      last = now;
      ctx.clearRect(0, 0, w, h);

      if (torch) {
        // Frame-rate independent approach to the pointer.
        const k = 1 - Math.pow(1 - TORCH_EASE, dt / (1000 / 60));
        torchX += (torchTargetX - torchX) * k;
        torchY += (torchTargetY - torchY) * k;
        ctx.globalAlpha = TORCH_ALPHA;
        ctx.drawImage(torch, torchX - TORCH_RADIUS, torchY - TORCH_RADIUS);
      }

      for (const p of particles) {
        p.life += dt;
        if (p.life >= p.dur) spawn(p, false);

        const prog = p.life / p.dur;
        const y = p.y - prog * (h + 80);
        const x = p.x + Math.sin(now * p.driftFreq + p.phase) * p.driftAmp;

        // Brief fade-in, then a long decay: most of the life is spent dim.
        const fadeIn = Math.min(prog / 0.12, 1);
        const fadeOut = (1 - prog) * (1 - prog);
        const alpha = PEAK_ALPHA * fadeIn * fadeOut;
        if (alpha <= 0.002) continue;

        const r = p.size * 4; // glow radius around a 1–2px core
        ctx.globalAlpha = alpha;
        ctx.drawImage(sprites[p.sprite], x - r, y - r, r * 2, r * 2);
      }

      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };

    const anyVideoPlaying = () =>
      Array.from(document.querySelectorAll("video")).some(
        (v) => !v.paused && !v.ended,
      );

    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      // Clear rather than freeze — a frozen field of specks reads as artefacts.
      ctx.clearRect(0, 0, w, h);
    };

    const start = () => {
      if (raf || document.hidden || anyVideoPlaying()) return;
      last = performance.now();
      raf = requestAnimationFrame(draw);
    };

    /* `play`/`pause` do not bubble — capture catches them from any video
       without this component knowing anything about VideoCard. */
    const onPlay = () => stop();
    const onPauseOrEnd = () => start();
    const onVisibility = () => (document.hidden ? stop() : start());
    const onResize = () => {
      resize();
      if (!raf) ctx.clearRect(0, 0, w, h);
    };

    document.addEventListener("play", onPlay, true);
    document.addEventListener("pause", onPauseOrEnd, true);
    document.addEventListener("ended", onPauseOrEnd, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", onResize);
    if (torch) window.addEventListener("pointermove", onPointer, { passive: true });

    start();

    return () => {
      stop();
      document.removeEventListener("play", onPlay, true);
      document.removeEventListener("pause", onPauseOrEnd, true);
      document.removeEventListener("ended", onPauseOrEnd, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
      if (torch) window.removeEventListener("pointermove", onPointer);
    };
  }, [enabled]);

  // prefers-reduced-motion: never mounted. The static background stands alone.
  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0"
    />
  );
}
