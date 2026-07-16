import type { Metadata } from "next";
import { isAuthed } from "@/lib/auth";
import { siteConfig } from "@/lib/config";
import { postersBySlug, videoSlugs } from "@/lib/videos";
import { logout } from "./actions";
import { ConfigForm, LoginForm } from "./forms";

export const metadata: Metadata = {
  title: "EPA — boshqaruv",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const authed = await isAuthed();

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center px-5 py-14">
      <h1 className="epa-display mb-8 text-2xl text-white">EPA · Boshqaruv</h1>

      {authed ? (
        <ConfigForm
          videos={siteConfig.videos}
          slugs={videoSlugs}
          postersBySlug={postersBySlug}
          logoutAction={logout}
        />
      ) : (
        <LoginForm />
      )}
    </main>
  );
}
