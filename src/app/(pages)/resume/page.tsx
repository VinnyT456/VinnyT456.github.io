import { pageMeta } from "@/lib/seo";
import Resume from "@/components/Resume";

export const metadata = pageMeta({
  title: "Resume — Vincent Tang",
  description:
    "Vincent Tang's résumé: CS at Northwestern, internships, selected projects, and skills. View it on the page or download the PDF.",
  path: "/resume",
  image: "/og/resume.png",
});

export default function ResumePage() {
  return <Resume />;
}
