import type { Metadata, Viewport } from "next";
import { resolveVideo, siteConfig } from "@/lib/config";
import "./globals.css";

/* Vercel injects the production host at build time, so OG tags resolve to
   absolute URLs without introducing another env var to forget. */
const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

const headline = siteConfig.videos[0]?.title ?? "EPA";

/* Video 1's poster doubles as the share image. For repo videos this is a
   relative path that metadataBase absolutises; for Bunny videos it is already
   an absolute CDN URL and passes through untouched. */
const shareImage = siteConfig.videos[0]
  ? resolveVideo(siteConfig.videos[0]).poster
  : "/posters/chilla-offer.jpg";
const description = "EPA — chilla. Ustalar va quruvchilar uchun.";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#070707",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: `EPA — ${headline}`,
  description,
  openGraph: {
    type: "website",
    locale: "uz_UZ",
    siteName: "EPA",
    title: `EPA — ${headline}`,
    description,
    images: [
      {
        url: shareImage,
        width: 720,
        height: 1280,
        alt: headline,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `EPA — ${headline}`,
    description,
    images: [shareImage],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uz" className="h-full">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
