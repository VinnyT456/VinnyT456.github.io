"use client";

import { useEffect } from "react";
import { STICKER_VARS } from "@/components/three/cubeColors";

/** Solved front-face sticker layout for the flat 2D cube. */
const FACE = [
  STICKER_VARS[0],
  STICKER_VARS[2],
  STICKER_VARS[4],
  STICKER_VARS[1],
  STICKER_VARS[3],
  STICKER_VARS[0],
  STICKER_VARS[2],
  STICKER_VARS[4],
  STICKER_VARS[1],
] as const;

const TURN_MS = 430;
const HOLD_MS = 140;

export default function FlatCube({
  label,
  turning,
  settled = false,
  onTurnComplete,
}: {
  label: string;
  turning: boolean;
  settled?: boolean;
  onTurnComplete: () => void;
}) {
  useEffect(() => {
    if (!turning) return;
    const timer = setTimeout(onTurnComplete, TURN_MS + HOLD_MS);
    return () => clearTimeout(timer);
  }, [turning, onTurnComplete]);

  return (
    <div className="flat-cube-scene" aria-hidden>
      <div
        className={`flat-cube-cube ${turning ? "flat-cube-cube--turn" : ""} ${
          settled ? "flat-cube-cube--settled" : ""
        }`}
      >
        <div className="flat-cube__face flat-cube__face--front">
          <div className="flat-cube__body">
            <div className="flat-cube__grid flat-cube__grid--full">
              {FACE.map((color, i) => (
                <span
                  key={i}
                  className="flat-cube__cell"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flat-cube__face flat-cube__face--next">
          <div className="flat-cube__body flat-cube__body--label">
            <span className="flat-cube__label">{label}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export { TURN_MS as FLAT_CUBE_TURN_MS };
