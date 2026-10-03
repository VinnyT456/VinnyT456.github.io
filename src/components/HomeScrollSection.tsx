"use client";

import type { ReactNode } from "react";

export default function HomeScrollSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="home-scroll-section">
      <div className="home-scroll-section__inner page-x mx-auto w-full max-w-5xl">
        <h2 className="mb-6 text-balance text-3xl font-medium tracking-tight sm:mb-8 sm:text-4xl">
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}
