import type { Metadata } from "next";
import { isAuthed } from "@/lib/auth";
import { siteConfig } from "@/lib/config";
import { bunnyCdnHost, listBunnyVideos } from "@/lib/bunny";
import { postersBySlug, videoSlugs } from "@/lib/videos";
import { logout } from "./actions";
import { ConfigForm, LoginForm } from "./forms";

export const metadata: Metadata = {
  title: "EPA — boshqaruv",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const authed = await isAuthed();
  /* Fetched per request — /admin is already dynamic (it reads a cookie), and
     a video uploaded to Bunny a minute ago should appear on refresh. */
  const bunnyVideos = authed ? await listBunnyVideos() : [];

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center px-5 py-14">
      <h1 className="epa-display mb-8 text-2xl text-white">EPA · Boshqaruv</h1>

      {authed ? (
        <ConfigForm
          videos={siteConfig.videos}
          slugs={videoSlugs}
          postersBySlug={postersBySlug}
          bunnyVideos={bunnyVideos}
          bunnyHost={bunnyCdnHost()}
          logoutAction={logout}
        />
      ) : (
        <LoginForm />
      )}
    </main>
  );
}
