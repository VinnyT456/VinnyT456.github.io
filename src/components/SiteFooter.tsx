import { site } from "@/data/site";

export default function SiteFooter() {
  return (
    <footer className="site-footer page-x mx-auto max-w-5xl py-6 pb-[calc(var(--space-dock)+env(safe-area-inset-bottom))] text-sm text-muted md:pb-6">
      © {new Date().getFullYear()} {site.name}. Built with Next.js and Three.js.
    </footer>
  );
}
