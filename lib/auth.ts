import "server-only";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "epa_admin";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

function secret(): string {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) throw new Error("ADMIN_PASSWORD is not set");
  return pw;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Stateless session token: "<expiry>.<hmac(expiry)>", keyed by ADMIN_PASSWORD.
 * No session store — a serverless function has no shared memory to keep one in,
 * and the brief rules out a database. Changing ADMIN_PASSWORD invalidates every
 * outstanding cookie for free.
 */
export function issueToken(): string {
  const exp = String(Date.now() + SESSION_TTL_MS);
  return `${exp}.${sign(exp)}`;
}

export function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const [exp, mac] = token.split(".");
  if (!exp || !mac) return false;
  if (!/^\d+$/.test(exp)) return false;
  if (Number(exp) < Date.now()) return false;
  try {
    return safeEqual(mac, sign(exp));
  } catch {
    return false;
  }
}

export function checkPassword(candidate: string): boolean {
  try {
    return safeEqual(candidate, secret());
  } catch {
    return false;
  }
}

export async function isAuthed(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get(SESSION_COOKIE)?.value);
}

/* ---------------------------------------------------------------
   Failed-attempt rate limit, in memory.

   Caveat worth knowing: each serverless instance has its own Map, so a
   determined attacker spread across cold starts gets more attempts than
   the nominal limit. This is a speed bump against casual guessing, not a
   real lockout — which is the correct trade for a two-field form with no
   database. Pick a long ADMIN_PASSWORD and that is what actually protects
   the route.
   --------------------------------------------------------------- */
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string): { ok: boolean; retryInMin: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 0, resetAt: now + WINDOW_MS });
    return { ok: true, retryInMin: 0 };
  }
  if (bucket.count >= MAX_ATTEMPTS) {
    return { ok: false, retryInMin: Math.ceil((bucket.resetAt - now) / 60000) };
  }
  return { ok: true, retryInMin: 0 };
}

export function recordFailure(key: string): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    bucket.count += 1;
  }
  // Opportunistic sweep so the Map cannot grow without bound.
  if (buckets.size > 500) {
    for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
  }
}

export function clearFailures(key: string): void {
  buckets.delete(key);
}

export { randomUUID };
