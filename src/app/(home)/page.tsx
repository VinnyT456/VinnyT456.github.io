import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import HomeHighlights from "@/components/HomeHighlights";
import CubeNavLauncher from "@/components/CubeNavLauncher";
import SiteFooter from "@/components/SiteFooter";

export default function HomePage() {
  return (
    <>
      <Nav />
      <main id="main">
        <Hero />
        <HomeHighlights />
      </main>
      <CubeNavLauncher />
      <SiteFooter />
    </>
  );
}
