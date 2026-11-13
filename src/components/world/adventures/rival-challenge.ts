import { clock, readBoard, readUndercityGhost } from "../stamps";

export function getRivalChallenge() {
  const raceBoard = ["easy", "medium", "hard"]
    .flatMap((difficulty) => readBoard("race", difficulty as "easy" | "medium" | "hard"))
    .sort((a, b) => (a.place ?? 9) - (b.place ?? 9) || a.ms - b.ms);
  const invadersBoard = readBoard("invaders");
  const snakeBoard = readBoard("snake");
  const race = raceBoard.find((entry) => entry.place === 1);
  const invaders = invadersBoard[0]?.score ?? 0;
  const snake = snakeBoard[0]?.score ?? 0;
  const ghost = readUndercityGhost();
  return [
    { id: "race", label: "Speedway", target: "1st place", best: race ? `1st place · ${clock(race.ms)}` : "No first-place finish", location: "Speedway · Race", attempted: raceBoard.length > 0, won: !!race },
    { id: "arcade", label: "Arcade", target: "Invaders 50+ or Snake 3+", best: `Invaders ${invaders} · Snake ${snake}`, location: "Lower city · Arcade hall", attempted: invadersBoard.length > 0 || snakeBoard.length > 0, won: invaders >= 50 || snake >= 3 },
    { id: "undercity", label: "Undercity", target: "≤ 2:00", best: ghost ? clock(ghost.timeMs) : "No completed traversal", location: "Lower city · Ghost run", attempted: !!ghost, won: !!ghost && ghost.timeMs <= 120_000 },
  ] as const;
}
