import type { ReactNode } from "react";

export default function PageShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main id="main" className="page-stage flex-1">
      <div className="page-x mx-auto flex w-full max-w-5xl flex-col justify-center py-[calc(env(safe-area-inset-top)+5rem)] pb-[calc(var(--space-dock)+var(--space-section)+env(safe-area-inset-bottom))] md:pb-[var(--space-section)]">
        <h1 className="mb-6 text-balance text-3xl font-medium tracking-tight sm:mb-8 sm:text-4xl">
          {title}
        </h1>
        {children}
      </div>
    </main>
  );
}
