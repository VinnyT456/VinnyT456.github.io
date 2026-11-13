import { pageMeta } from "@/lib/seo";
import Contact from "@/components/Contact";

export const metadata = pageMeta({
  title: "Contact — Vincent Tang",
  description:
    "Get in touch with Vincent Tang about internships, projects, or a questionable side idea. Message form, GitHub, LinkedIn, and email.",
  path: "/contact",
  image: "/og/contact.png",
});

export default function ContactPage() {
  return <Contact />;
}
