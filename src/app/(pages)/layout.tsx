import IntroReveal from "@/components/IntroReveal";
import CubeNavLauncher from "@/components/CubeNavLauncher";
import Nav from "@/components/Nav";
import SiteFooter from "@/components/SiteFooter";

export default function PagesLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="site-content relative z-10 flex min-h-full flex-1 flex-col bg-transparent">
      <IntroReveal />
      <Nav />
      {children}
      <CubeNavLauncher />
      <SiteFooter />
    </div>
  );
}
