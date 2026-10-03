import SkillsWorkshop from "@/components/skills/SkillsWorkshop";
import { skills } from "@/data/skills";

export const metadata = {
  title: "Skills — Vincent Tang",
  description: `The ${skills.length} languages, frameworks, and tools behind Vincent Tang's projects, grouped by how much each is actually used, with the projects built on each.`,
};

export default function SkillsPage() {
  return <SkillsWorkshop />;
}
