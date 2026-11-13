import { places, type PlaceId } from "@/data/world";
import { placeDoor } from "./Walker";

/**
 * The guided tour: one stop per place, in the bar's order. At each, the
 * walker is set down on the street out front and walks up to the door (the
 * click-to-walk path is a straight line, so it starts somewhere with nothing
 * in the way); the place's card opens as it arrives, with its real facts.
 */
export type Stop = { id: PlaceId; label: string; kind: string; from: [number, number]; door: [number, number] };

/** How long the tour stays at each stop before moving on (unless paused). */
export const STOP_MS = 11000;

export const TOUR: Stop[] = places.map((p) => {
  const door = placeDoor(p.id);
  // out from the building, through its door, onto the street
  const vx = door[0] - p.at[0];
  const vz = door[1] - p.at[1];
  const len = Math.hypot(vx, vz) || 1;
  return { id: p.id, label: p.label, kind: p.kind, door, from: [door[0] + (vx / len) * 1.3, door[1] + (vz / len) * 1.3] };
});
