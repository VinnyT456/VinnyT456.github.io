import HomeEffects from "@/components/HomeEffects";

export default function HomeLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <HomeEffects />
      <div className="site-content site-content--gated relative z-10 flex min-h-full flex-1 flex-col bg-transparent">
        {children}
      </div>
    </>
  );
}
