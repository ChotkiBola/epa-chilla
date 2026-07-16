import type { Metadata, Viewport } from "next";
import { siteConfig } from "@/lib/config";
import "./globals.css";

/* Vercel injects the production host at build time, so OG tags resolve to
   absolute URLs without introducing another env var to forget. */
const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

const headline = siteConfig.videos[0]?.title ?? "EPA";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#070707",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: `EPA — ${headline}`,
  description: "EPA — chilla. Ustalar va quruvchilar uchun.",
  openGraph: {
    type: "website",
    locale: "uz_UZ",
    siteName: "EPA",
    title: `EPA — ${headline}`,
    description: "EPA — chilla. Ustalar va quruvchilar uchun.",
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
