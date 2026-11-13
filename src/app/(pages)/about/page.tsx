import { pageMeta } from "@/lib/seo";
import Terminal from "@/components/experience/Terminal";

export const metadata = pageMeta({
  title: "About — Vincent Tang",
  description:
    "Vincent Tang's about page is a working terminal: type whoami, ls, or fortune to see who he is, what he's studying, and what he's building.",
  path: "/about",
  image: "/og/about.png",
});

export default function AboutPage() {
  return <Terminal />;
}
