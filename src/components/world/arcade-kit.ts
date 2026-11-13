/** What every arcade cabinet's game is made of: a 480×320 screen, the keys, and a step/draw pair. */
export const W = 480;
export const H = 320;
export type Input = { left: boolean; right: boolean; up: boolean; down: boolean; action: boolean };
export type Colours = { bg: string; ink: string; muted: string; accent: string };
export type Game = { score: number; over: boolean; note?: string; step: (dt: number, i: Input) => void; draw: (g: CanvasRenderingContext2D, c: Colours) => void };

/** Presses, not holds: true on the frame a key goes down (and `action`, already a pulse). */
export function presses() {
  const was = { left: false, right: false, up: false, down: false };
  return (i: Input) => {
    const hit = { left: i.left && !was.left, right: i.right && !was.right, up: i.up && !was.up, down: i.down && !was.down, action: i.action };
    was.left = i.left;
    was.right = i.right;
    was.up = i.up;
    was.down = i.down;
    return hit;
  };
}
