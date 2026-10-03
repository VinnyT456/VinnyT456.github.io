import Nav from "@/components/Nav";
import SiteFooter from "@/components/SiteFooter";
import NotFoundWorkshop from "@/components/NotFoundWorkshop";

export const metadata = {
  title: "404 — off the map",
  description: "This page doesn't exist on Vincent Tang's portfolio. Head back home or see the work.",
};

export default function NotFound() {
  return (
    <>
      <Nav />
      <NotFoundWorkshop />
      <SiteFooter />
    </>
  );
}
