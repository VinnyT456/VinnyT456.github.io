import Terminal from "@/components/experience/Terminal";

export const metadata = {
  title: "About — Vincent Tang",
  description:
    "Vincent Tang's about page is a working terminal: type whoami, ls, or fortune to see who he is, what he's studying, and what he's building.",
};

export default function AboutPage() {
  return <Terminal />;
}
