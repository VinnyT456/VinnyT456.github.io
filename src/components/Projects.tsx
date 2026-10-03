import { site } from "@/data/site";
import { cn } from "@/lib/utils";
import CardHoverGlow from "@/components/CardHoverGlow";

function isLiveHref(href: string) {
  return href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("/");
}

function ProjectMeta({
  p,
}: {
  p: (typeof site.projects)[number];
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {p.tags.map((t) => (
        <span key={t} className="font-mono text-sm text-muted">
          {t}
        </span>
      ))}
    </div>
  );
}

export default function Projects() {
  const featured = site.projects[0];
  const rest = site.projects.slice(1);

  if (!featured) {
    return (
      <p className="max-w-prose text-pretty text-lg leading-relaxed text-foreground/80">
        Nothing listed yet. Email me if you want to see work in progress.
      </p>
    );
  }

  const featuredLive = isLiveHref(featured.href);
  const featuredClass =
    "flex flex-col gap-6 border-b border-foreground/10 pb-12 sm:flex-row sm:items-end sm:justify-between sm:gap-12";
  const featuredInner = (
    <>
      <div className="max-w-prose">
        <p className="font-mono text-sm text-muted">
          {featured.year}
          {featuredLive ? null : " · This page"}
        </p>
        <h3 className="mt-3 text-2xl font-medium tracking-tight sm:text-3xl">
          {featured.title}
        </h3>
        <p className="mt-6 text-pretty text-base leading-relaxed text-foreground/80 sm:text-lg">
          {featured.description}
        </p>
      </div>
      <ProjectMeta p={featured} />
    </>
  );

  return (
    <>
      {featuredLive ? (
        <CardHoverGlow className={featuredClass}>
          <a href={featured.href} className="contents">
            {featuredInner}
          </a>
        </CardHoverGlow>
      ) : (
        <CardHoverGlow className={featuredClass}>
          <article className="contents">{featuredInner}</article>
        </CardHoverGlow>
      )}

      {rest.length > 0 ? (
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {rest.map((p) => {
            const live = isLiveHref(p.href);
            const className = cn(
              "group relative flex flex-col rounded-2xl border border-foreground/10 bg-surface p-6",
              live &&
                "active:border-foreground/25 [@media(hover:hover)]:hover:border-foreground/25"
            );
            const inner = (
              <>
                <div className="mb-3 flex items-baseline justify-between gap-6">
                  <h3 className="text-lg font-medium">{p.title}</h3>
                  <span className="font-mono text-sm text-muted">{p.year}</span>
                </div>
                <p className="mb-6 flex-1 text-pretty text-base leading-relaxed text-foreground/80 sm:text-sm">
                  {p.description}
                </p>
                <ProjectMeta p={p} />
                {live && (
                  <span className="mt-6 text-sm text-muted [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:transition-opacity [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
                    View project →
                  </span>
                )}
              </>
            );

            if (live) {
              return (
                <CardHoverGlow key={p.title} className={className}>
                  <a href={p.href} className="contents">
                    {inner}
                  </a>
                </CardHoverGlow>
              );
            }

            return (
              <CardHoverGlow key={p.title} className={className}>
                <article className="contents">{inner}</article>
              </CardHoverGlow>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
