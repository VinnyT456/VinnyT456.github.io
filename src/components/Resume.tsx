import TransitionLink from "@/components/transitions/TransitionLink";
import { site } from "@/data/site";
import { exhibits, exhibitSlug } from "@/data/museum";
import { skills, type Skill } from "@/data/skills";
import { experienceFloors } from "@/data/experienceFloors";

/** Résumé-worthy builds, strongest first — each links to its museum room. */
const RESUME_PROJECTS = [
  "Genshin Combat Optimizer",
  "CS Internship Bot",
  "Finance Job Dashboard",
  "Paralytica",
];

/** The education floor lives in its own section below, not under Experience. */
const EDUCATION_FLOOR = "northwestern-bs-cs";

/**
 * The Resume page — the quiet documentation layer of the portfolio.
 *
 * The résumé is real HTML, built from the same data as the Experience,
 * Projects and Skills pages, so it reads well on a phone, works with a screen
 * reader, and can't drift out of sync with the rest of the site. The PDF (in
 * /public, see `site.resume.pdf`) is the download/print copy — not an embedded
 * viewer. No graduation date/year anywhere, by design (see site.resume).
 *
 * Entrance is CSS-only (see `.rez*` in globals.css), reduced-motion safe.
 */
export default function Resume() {
  const { summary, pdf, updated, education } = site.resume;
  const hasPdf = pdf.length > 0;

  const roles = experienceFloors.filter((r) => r.id !== EDUCATION_FLOOR);
  const projects = RESUME_PROJECTS.map((id) => exhibits.find((e) => e.id === id)).filter(
    (e): e is (typeof exhibits)[number] => Boolean(e)
  );
  // Tools that carry real weight — headline and working tools, by category.
  const toolsByCategory = skills
    .filter((s) => s.usageLevel === "primary" || s.usageLevel === "working")
    .reduce<Record<string, Skill[]>>((acc, s) => {
      (acc[s.category] ??= []).push(s);
      return acc;
    }, {});

  return (
    <main id="main" className="rez page-stage flex-1">
      <div className="rez__inner page-x mx-auto w-full max-w-4xl">
        <header className="rez__intro">
          <h1 className="rez__title">My résumé.</h1>
          <p className="rez__lead">{summary}</p>

          <div className="rez__actions">
            {hasPdf ? (
              <>
                <a href={pdf} download className="rez__btn rez__btn--primary">
                  Download PDF <span aria-hidden>↓</span>
                </a>
                <a
                  href={pdf}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rez__btn"
                >
                  Open PDF <span aria-hidden>↗</span>
                </a>
              </>
            ) : (
              <a
                href={`mailto:${site.email}?subject=R%C3%A9sum%C3%A9%20request`}
                className="rez__btn rez__btn--primary"
              >
                Request the PDF <span aria-hidden>→</span>
              </a>
            )}
          </div>
        </header>

        {/* a single quiet fact line — no stat-tile band, no dates */}
        <p className="rez__meta font-mono">
          Computer Science, Northwestern
          <span className="rez__meta-sep" aria-hidden>
            /
          </span>
          {exhibits.length} projects
          <span className="rez__meta-sep" aria-hidden>
            /
          </span>
          {skills.length} tools
        </p>

        <article className="rez__sheet" aria-label="Résumé">
          {/* Education always leads */}
          {education.length > 0 ? (
            <section className="rez__block" aria-labelledby="rez-education">
              <h2 id="rez-education" className="rez__block-h">
                Education
              </h2>
              <ul className="rez__edu">
                {education.map((e) => (
                  <li key={e.school} className="rez__edu-item">
                    <span className="rez__edu-degree">{e.degree}</span>
                    <span className="rez__edu-school">{e.school}</span>
                    {e.coursework?.length ? (
                      <p className="rez__edu-courses">
                        <span className="rez__edu-courses-label">Relevant coursework:</span>{" "}
                        {e.coursework.join(" · ")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section className="rez__block" aria-labelledby="rez-experience">
            <h2 id="rez-experience" className="rez__block-h">
              Experience
            </h2>
            <ol className="rez__entries">
              {roles.map((r) => (
                <li key={r.id} className="rez__entry">
                  <div className="rez__entry-head">
                    <h3 className="rez__entry-title">
                      {r.title}
                      <span className="rez__entry-org">
                        {" "}
                        · {r.organization}
                      </span>
                    </h3>
                    <p className="rez__entry-when font-mono">{r.dates}</p>
                  </div>
                  <p className="rez__entry-where">{r.location}</p>
                  {r.highlights.length > 0 ? (
                    <ul className="rez__bullets">
                      {r.highlights.slice(0, 3).map((h) => (
                        <li key={h}>{h}</li>
                      ))}
                    </ul>
                  ) : null}
                  {r.technologies.length > 0 ? (
                    <p className="rez__tech font-mono">{r.technologies.join(" · ")}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>

          <section className="rez__block" aria-labelledby="rez-projects">
            <h2 id="rez-projects" className="rez__block-h">
              Selected projects
            </h2>
            <ol className="rez__entries">
              {projects.map((p) => (
                <li key={p.id} className="rez__entry">
                  <div className="rez__entry-head">
                    <h3 className="rez__entry-title">
                      <TransitionLink
                        href={`/projects?exhibit=${exhibitSlug(p)}`}
                        className="rez__entry-link"
                      >
                        {p.title}
                      </TransitionLink>
                    </h3>
                    <p className="rez__entry-when font-mono">{p.year}</p>
                  </div>
                  <p className="rez__entry-desc">{p.description}</p>
                  <p className="rez__tech font-mono">{p.technologies.join(" · ")}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="rez__block" aria-labelledby="rez-skills">
            <h2 id="rez-skills" className="rez__block-h">
              Skills
            </h2>
            <dl className="rez__skills">
              {Object.entries(toolsByCategory).map(([category, list]) => (
                <div key={category} className="rez__skills-row">
                  <dt>{category}</dt>
                  <dd>{list.map((s) => s.name).join(", ")}</dd>
                </div>
              ))}
            </dl>
          </section>

        </article>

        <footer className="rez__foot">
          <p className="rez__updated font-mono">Updated {updated}</p>
          <nav className="rez__links" aria-label="Explore more">
            <TransitionLink href="/experience" className="rez__link">
              Experience
            </TransitionLink>
            <TransitionLink href="/projects" className="rez__link">
              Projects
            </TransitionLink>
            <TransitionLink href="/skills" className="rez__link">
              Skills
            </TransitionLink>
          </nav>
        </footer>
      </div>
    </main>
  );
}
