import { pageMeta } from "@/lib/seo";
import ExperienceJourney from "@/components/experience/ExperienceJourney";

export const metadata = pageMeta({
  title: "Experience — Vincent Tang",
  description:
    "Vincent Tang's experience: a software engineering internship at Raiders Marketplace, a hackathon program internship at Grassroot Academy, and IT consulting at Northwestern.",
  path: "/experience",
  image: "/og/experience.png",
});

export default function ExperiencePage() {
  return <ExperienceJourney />;
}
