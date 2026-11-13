import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { site } from "@/data/site";
import MotionProvider from "@/components/MotionProvider";
import SiteEffects from "@/components/SiteEffects";
import ThemeSync from "@/components/ThemeSync";
import { THEME_COLOR, THEME_SCRIPT } from "@/lib/themeConfig";
import PageTransitionProvider from "@/components/transitions/PageTransitionProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  // glyphs outside the latin subset (→ ←) fall to a monospace face, not the metric-matched
  // Arial fallback, so they keep one column and the terminal's hanging indents hold
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
});

export const metadata: Metadata = {
  // every relative og:image / canonical URL below resolves against the live site
  metadataBase: new URL(site.url),
  title: `${site.name} — ${site.headline}`,
  description:
    "Vincent Tang, a CS student at Northwestern seeking SWE internships, ships real product and builds the playful stuff for the joy of it. Interactive 3D portfolio.",
  // the home page's card; every other page sets its own (lib/seo.ts)
  openGraph: {
    type: "website",
    siteName: site.name,
    locale: "en_US",
    url: "/",
    images: [{ url: "/og/home.png", width: 1200, height: 630, alt: `${site.name} — ${site.headline}` }],
  },
  twitter: { card: "summary_large_image", images: ["/og/home.png"] },
  alternates: {
    types: { "application/rss+xml": [{ url: "/notes/feed.xml", title: `${site.name} — Notes` }] },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // theme-color is a plain <meta> in <head> below, not metadata: Next rewrites
  // metadata on every navigation, which would reset the light theme's colour
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // the <head> script sets data-theme (and the dark class) before paint, so
    // the server's dark default may differ from what hydrates: expected
    <html
      lang="en"
      data-scroll-behavior="smooth"
      data-theme="dark"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <meta name="theme-color" content={THEME_COLOR.dark} />
        {/* no flash of the wrong theme: runs before the body paints */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <ThemeSync />
        <MotionProvider>
          <PageTransitionProvider>
            <a href="#main" className="skip-link">
              Skip to content
            </a>
            <SiteEffects />
            {children}
          </PageTransitionProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
