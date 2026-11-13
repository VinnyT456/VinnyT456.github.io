"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/icons";
import { site } from "@/data/site";
import { places, type PlaceId } from "@/data/world";
import { FEAT_NAMES, clock, type Best, type Feat } from "./stamps";
import { saveCanvas } from "./photo";

type Stamp = { label: string; got: boolean; color?: string };

/**
 * The passport: a stamp for each place seen, each secret found and each
 * feat done. Secrets not yet found stay hidden (no spoilers). It can be saved
 * as a picture card.
 */
export default function Passport({
  explored,
  secrets,
  secretNames,
  clues,
  clueNames,
  feats,
  best,
  light,
  onClose,
}: {
  explored: ReadonlySet<PlaceId>;
  secrets: ReadonlySet<string>;
  secretNames: Record<string, string>;
  clues: ReadonlySet<string>;
  clueNames: Record<string, string>;
  feats: ReadonlySet<Feat>;
  best: Partial<Record<Best, number>>;
  light: boolean;
  onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  const groups: { name: string; stamps: Stamp[] }[] = [
    { name: "Places", stamps: places.map((p) => ({ label: p.label, got: explored.has(p.id), color: p.color })) },
    { name: "Secrets", stamps: Object.entries(secretNames).map(([k, n]) => ({ label: secrets.has(k) ? n : "???", got: secrets.has(k) })) },
    // the arcade code's pieces: what each one gave you, once you've found it
    { name: "Arcade code", stamps: Object.entries(clueNames).map(([k, n]) => ({ label: clues.has(k) ? n : "???", got: clues.has(k) })) },
    { name: "Feats", stamps: (Object.keys(FEAT_NAMES) as Feat[]).map((f) => ({ label: FEAT_NAMES[f], got: feats.has(f) })) },
  ];
  const got = groups.reduce((n, g) => n + g.stamps.filter((s) => s.got).length, 0);
  const all = groups.reduce((n, g) => n + g.stamps.length, 0);
  const times = [
    best.lap !== undefined ? `Best lap ${clock(best.lap)}` : null,
    best.rings !== undefined ? `Ring course ${clock(best.rings)}` : null,
  ].filter(Boolean);

  return (
    <section className="cube-world__card cube-world__passport" aria-labelledby="cube-world-passport">
      <h3 id="cube-world-passport" ref={heading} tabIndex={-1}>
        Passport
      </h3>
      <p className="cube-world__kind">
        {got} of {all} stamps{times.length ? ` · ${times.join(" · ")}` : ""}
      </p>
      {groups.map((g) => (
        <div key={g.name} className="cube-world__stamps">
          <h4>{g.name}</h4>
          <ul>
            {g.stamps.map((s, i) => (
              <li key={i} className={s.got ? "is-got" : undefined} style={s.color ? { ["--stamp" as string]: s.color } : undefined}>
                <span className="cube-world__stamp" aria-hidden>
                  {s.got ? <Icon name="check" size={12} /> : null}
                </span>
                {s.label}
                <span className="sr-only">{s.got ? " (stamped)" : " (not yet)"}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="cube-world__actions">
        <button type="button" className="cube-world__back" onClick={() => saveCanvas(drawCard(groups, got, all, times as string[], light), "cube-passport.png")}>
          Save as image
        </button>
        <button type="button" className="cube-world__back" onClick={onClose}>
          Close
        </button>
      </div>
    </section>
  );
}

/** The passport as a picture: a 1200×630 card, the size link previews use. */
function drawCard(groups: { name: string; stamps: Stamp[] }[], got: number, all: number, times: string[], light: boolean) {
  const W = 1200;
  const H = 630;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const css = getComputedStyle(document.documentElement);
  const sans = css.getPropertyValue("--font-geist-sans").trim() || "system-ui";
  const mono = css.getPropertyValue("--font-geist-mono").trim() || "ui-monospace";
  const ink = light ? "#1c1530" : "#e8e4ff";
  const muted = light ? "#5d5480" : "#a59fc4";
  g.fillStyle = light ? "#ece8fb" : "#0b0912";
  g.fillRect(0, 0, W, H);
  g.fillStyle = ink;
  g.font = `600 44px ${sans}, system-ui, sans-serif`;
  g.fillText("Inside the cube: passport", 64, 104);
  g.fillStyle = muted;
  g.font = `500 22px ${mono}, ui-monospace, monospace`;
  g.fillText([`${got} of ${all} stamps`, ...times].join("  ·  "), 64, 146);
  let y = 214;
  for (const grp of groups) {
    g.fillStyle = muted;
    g.font = `600 18px ${mono}, ui-monospace, monospace`;
    g.fillText(grp.name.toUpperCase(), 64, y);
    let x = 64;
    y += 40;
    for (const s of grp.stamps) {
      g.font = `500 18px ${sans}, system-ui, sans-serif`;
      const w = 34 + g.measureText(s.label).width + 24;
      if (x + w > W - 64) {
        x = 64;
        y += 40;
      }
      g.beginPath();
      g.arc(x + 11, y - 6, 10, 0, Math.PI * 2);
      if (s.got) {
        g.fillStyle = s.color ?? "#8b5cf6";
        g.fill();
      } else {
        g.strokeStyle = muted;
        g.setLineDash([3, 3]);
        g.lineWidth = 1.5;
        g.stroke();
        g.setLineDash([]);
      }
      g.fillStyle = s.got ? ink : muted;
      g.fillText(s.label, x + 30, y);
      x += w;
    }
    y += 62;
  }
  g.fillStyle = muted;
  g.font = `500 18px ${mono}, ui-monospace, monospace`;
  g.fillText(site.url.replace(/^https?:\/\//, ""), 64, H - 48);
  return c;
}
