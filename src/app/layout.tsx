import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { site } from "@/data/site";
import MotionProvider from "@/components/MotionProvider";
import SiteEffects from "@/components/SiteEffects";
import PageTransitionProvider from "@/components/transitions/PageTransitionProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${site.name} — ${site.headline}`,
  description:
    "Vincent Tang, a CS student at Northwestern seeking SWE internships, ships real product — and builds the playful stuff for the joy of it. Interactive 3D portfolio.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#08080b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
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
