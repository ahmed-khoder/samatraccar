import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono, Cairo } from "next/font/google";
import "./globals.css";
import { I18nProvider, type Lang } from "@/lib/i18n";
import { PrefsProvider } from "@/lib/prefs";
import { parsePrefs } from "@/lib/prefs-shared";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const cairo = Cairo({ variable: "--font-ar", subsets: ["arabic", "latin"] });

export const metadata: Metadata = {
  title: "SAMA Logistics — Fleet Tracking",
  description: "Live vehicle tracking, trip replay and fleet analytics powered by Traccar",
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#070b14" }, { media: "(prefers-color-scheme: light)", color: "#f3f6fb" }] };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const lang: Lang = jar.get("lang")?.value === "en" ? "en" : "ar";
  const prefs = parsePrefs(jar.get("prefs")?.value);
  return (
    <html lang={lang} dir={lang === "ar" ? "rtl" : "ltr"} data-theme={prefs.theme} className={`${geistSans.variable} ${geistMono.variable} ${cairo.variable} h-full antialiased`}>
      <body className="min-h-full">
        <I18nProvider initial={lang}><PrefsProvider initial={prefs}>{children}</PrefsProvider></I18nProvider>
      </body>
    </html>
  );
}
