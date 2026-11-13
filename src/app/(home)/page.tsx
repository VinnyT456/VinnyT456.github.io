import Nav from "@/components/Nav";
import Hero from "@/components/Hero";
import LiveWork from "@/components/home/LiveWork";
import CubeNavLauncher from "@/components/CubeNavLauncher";
import SiteFooter from "@/components/SiteFooter";

export default function HomePage() {
  return (
    <>
      <Nav />
      <main id="main">
        <Hero />
        <LiveWork />
      </main>
      <CubeNavLauncher />
      <SiteFooter />
    </>
  );
}
