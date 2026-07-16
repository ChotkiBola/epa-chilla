import "server-only";
import type { SiteConfig } from "./config";

/**
 * The entire persistence layer: commit to Git via the GitHub Contents API,
 * which trips Vercel's auto-redeploy. No database, no object store.
 */

const API = "https://api.github.com";

type Env = { token: string; repo: string; branch: string };

function env(): Env {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";
  if (!token) throw new Error("GITHUB_TOKEN is not set");
  if (!repo || !repo.includes("/")) {
    throw new Error("GITHUB_REPO must look like 'owner/repository'");
  }
  return { token, repo, branch };
}

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

/** Current blob SHA for a path, or null if the file does not exist yet. */
async function getSha(
  path: string,
  { token, repo, branch }: Env,
): Promise<string | null> {
  const url = `${API}/repos/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: headers(token), cache: "no-store" });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GitHub read failed for ${path} (${res.status})`);
  }
  const body = (await res.json()) as { sha?: string };
  return body.sha ?? null;
}

/** Create or update one file. Base64 content, as the Contents API requires. */
async function putFile(
  path: string,
  contentBase64: string,
  message: string,
  e: Env,
): Promise<void> {
  const sha = await getSha(path, e);
  const res = await fetch(
    `${API}/repos/${e.repo}/contents/${encodeURI(path)}`,
    {
      method: "PUT",
      headers: headers(e.token),
      cache: "no-store",
      body: JSON.stringify({
        message,
        content: contentBase64,
        branch: e.branch,
        ...(sha ? { sha } : {}),
      }),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `GitHub write failed for ${path} (${res.status}) ${detail.slice(0, 200)}`,
    );
  }
}

export type PosterUpload = { path: string; contentBase64: string };

/**
 * One save = config.json plus any changed poster blobs. The Contents API is
 * one-file-per-request, so posters land first; if a poster write fails we
 * throw before touching config.json, leaving the live site untouched.
 */
export async function commitSiteConfig(
  config: SiteConfig,
  posters: PosterUpload[] = [],
): Promise<void> {
  const e = env();
  const stamp = new Date().toISOString();

  for (const poster of posters) {
    await putFile(poster.path, poster.contentBase64, `chore(admin): poster ${poster.path}`, e);
  }

  const json = JSON.stringify(config, null, 2) + "\n";
  await putFile(
    "config.json",
    Buffer.from(json, "utf8").toString("base64"),
    `chore(admin): update config ${stamp}`,
    e,
  );
}
