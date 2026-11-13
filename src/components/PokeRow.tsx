"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import type { Poke } from "@/data/pokes";

/**
 * A row of small objects to poke. Pressing one makes it answer with a fact in
 * a bubble; pressing it again moves to its next fact (a dice rolls again).
 * The bubble is a polite live region, so the answer is read out too.
 */
export default function PokeRow({
  pokes,
  heading = "Poke around",
  initial,
  className = "",
}: {
  pokes: Poke[];
  heading?: string;
  /** a poke to show already pressed (the island's gems open on theirs) */
  initial?: string;
  className?: string;
}) {
  const [shown, setShown] = useState<{ id: string; i: number } | null>(() =>
    initial && pokes.some((p) => p.id === initial) ? { id: initial, i: 0 } : null
  );
  if (!pokes.length) return null;

  const press = (p: Poke) => {
    setShown((cur) => {
      if (cur?.id === p.id) return { id: p.id, i: (cur.i + 1) % p.facts.length };
      return { id: p.id, i: p.shuffle ? Math.floor(Math.random() * p.facts.length) : 0 };
    });
  };

  const active = shown ? pokes.find((p) => p.id === shown.id) : undefined;
  const fact = active && shown ? active.facts[shown.i] : null;
  const more = active ? active.facts.length > 1 : false;

  return (
    <div className={`pokes ${className}`}>
      <p className="pokes__heading">{heading}</p>
      <div className="pokes__row">
        {pokes.map((p) => (
          <button
            key={p.id}
            type="button"
            className="pokes__thing"
            aria-pressed={shown?.id === p.id}
            onClick={() => press(p)}
          >
            <Icon name={p.icon} size={15} aria-hidden />
            {p.label}
          </button>
        ))}
      </div>
      <p className="pokes__bubble" aria-live="polite" data-empty={fact ? undefined : ""}>
        {fact ? (
          <>
            {fact}
            {more ? <span className="pokes__again"> · press again for another</span> : null}
          </>
        ) : null}
      </p>
    </div>
  );
}
