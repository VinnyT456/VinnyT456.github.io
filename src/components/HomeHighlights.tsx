import { exhibits, exhibitSlug } from "@/data/museum";
import { skills } from "@/data/skills";
import TransitionLink from "@/components/transitions/TransitionLink";

/** The flagship leads, with the portfolio itself under it; the rest follow
 *  as a quieter list. Each opens its room in the museum. */
const LEAD = "Genshin Combat Optimizer";
const UNDER_LEAD = "This site";
const FOLLOW = ["CS Internship Bot", "Exploding Kittens", "Genshin Lyre Autoplayer"];

const byId = (id: string) => exhibits.find((e) => e.id === id);

/**
 * Two quiet bands below the hero so the home page isn't a dead end.
 *
 * Selected work is deliberately NOT a row of identical cards: one project
 * leads at display size with its full story, the rest sit beside it as a
 * typographic list on hairlines. "Currently" is a label/value row, its tools
 * inline in the sentence's rhythm rather than a floating chip cluster. The
 * cube stays the one glowing centerpiece.
 */
export default function HomeHighlights() {
  const lead = byId(LEAD);
  const follow = FOLLOW.map(byId).filter((e): e is (typeof exhibits)[number] => Boolean(e));
  const underLead = byId(UNDER_LEAD);
  // tools in active use right now, straight from the Skills data
  const stack = skills.filter((s) => s.current).map((s) => s.name).slice(0, 5);

  return (
    <section
      aria-labelledby="home-highlights"
      className="hh page-x mx-auto max-w-5xl pb-[var(--space-section-compact)] pt-2 md:pt-0"
    >
      <h2 id="home-highlights" className="sr-only">
        Highlights
      </h2>

      <div className="hh-head">
        <h3 className="hh-head-title">Selected work</h3>
        <TransitionLink href="/projects" className="hh-all">
          All {exhibits.length} projects <span aria-hidden>→</span>
        </TransitionLink>
      </div>

      <div className="hh-work">
        <div className="hh-main">
          {lead ? (
            <TransitionLink href={`/projects?exhibit=${exhibitSlug(lead)}&from=home`} className="hh-lead">
              <h4 className="hh-lead-title">
                <span className="hh-title-text">{lead.title}</span>
              </h4>
              <p className="hh-meta">
                {lead.year} · {lead.category}
              </p>
              <p className="hh-lead-desc">{lead.description}</p>
              {/* two of the room's own highlights: the lead's proof, and enough
                  body that its column matches the list beside it */}
              <ul className="hh-lead-points">
                {(lead.technical?.highlights ?? []).slice(0, 2).map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
              <p className="hh-tech font-mono">{lead.technologies.slice(0, 5).join(" · ")}</p>
              <span className="hh-open">
                Step inside <span aria-hidden>→</span>
              </span>
            </TransitionLink>
          ) : null}
          {underLead ? (
            <TransitionLink
              href={`/projects?exhibit=${exhibitSlug(underLead)}&from=home`}
              className="hh-item hh-item--under"
            >
              <div className="hh-item-head">
                <h4 className="hh-item-title">
                  <span className="hh-title-text">{underLead.title}</span>
                </h4>
                <span className="hh-item-year font-mono">{underLead.year}</span>
              </div>
              <span className="hh-item-desc">{underLead.description}</span>
              <span className="hh-tech font-mono">{underLead.technologies.slice(0, 4).join(" · ")}</span>
            </TransitionLink>
          ) : null}
        </div>

        <ul className="hh-list">
          {follow.map((p) => (
            <li key={p.id}>
              <TransitionLink href={`/projects?exhibit=${exhibitSlug(p)}&from=home`} className="hh-item">
                <div className="hh-item-head">
                  <h4 className="hh-item-title">
                    <span className="hh-title-text">{p.title}</span>
                  </h4>
                  <span className="hh-item-year font-mono">{p.year}</span>
                </div>
                <span className="hh-item-desc">{p.description}</span>
                <span className="hh-tech font-mono">{p.technologies.slice(0, 4).join(" · ")}</span>
              </TransitionLink>
            </li>
          ))}
        </ul>
      </div>

      <div className="hh-now">
        <h3 className="hh-now-label">Currently</h3>
        <div className="hh-now-body">
          <p className="hh-now-text">
            Researching and building{" "}
            <a
              className="hh-now-link"
              href="https://studio.knightlab.com/projects/look-again/"
              target="_blank"
              rel="noreferrer"
            >
              Look Again
            </a>{" "}
            at Northwestern Knight Lab, and a software engineer on a project team at{" "}
            <a
              className="hh-now-link"
              href="https://nnci.northwestern.edu/major-initiatives/forge.html"
              target="_blank"
              rel="noreferrer"
            >
              Northwestern Forge
            </a>
            . On the side: this site and many other projects, built in the open.
          </p>
          <p className="hh-now-stack">
            <span className="hh-now-stack-label">In use now</span>
            {/* separators ride at the END of each item (nowrap), so a wrapped
                line never starts with a stray "·" */}
            <span className="hh-stack font-mono">
              {stack.map((s, i) => (
                <span key={s} className="hh-stack-item">
                  {s}
                  {i < stack.length - 1 ? (
                    <span className="hh-stack-sep" aria-hidden>
                      ·
                    </span>
                  ) : null}
                </span>
              ))}
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
