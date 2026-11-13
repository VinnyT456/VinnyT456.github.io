import { site } from "@/data/site";

/**
 * "Postcard from the island": the photo-mode picture framed as a postcard.
 * Drawn entirely on a canvas in the browser. Nothing is uploaded anywhere;
 * the only ways out are a file download and (where the browser has one) the
 * system share sheet, both started by the visitor.
 *
 * Night look only: the island is always night.
 */

export type PostcardSpot = {
  /** the named street underfoot (Walker's streetAt), if any */
  street: string | null;
  /** a landmark or project the walker is standing by, as plain words */
  nearby: string | null;
  /** which floor, in words ("the lower city"), when not on the surface */
  level: string | null;
};

/** The caption, from where the walker really is. Never invented. */
export function postcardCaption(spot: PostcardSpot): { greeting: string; detail: string } {
  // the stair strings from the walker read "the speedway stairs, riding up": a place, not a street
  const where = spot.street ?? spot.level ?? "the island";
  const greeting = `Greetings from ${where}`;
  const parts: string[] = [];
  if (spot.street && spot.level) parts.push(spot.level);
  if (spot.nearby) parts.push(spot.nearby);
  return { greeting, detail: parts.join(" · ") };
}

const first = site.name.split(" ")[0];
const HAND = `"Bradley Hand", "Segoe Print", "Chalkboard SE", "Marker Felt", "Comic Sans MS", cursive`;

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && g.measureText(next).width > maxW) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Fit one line by shrinking its font size, so a long street name never runs off the card. */
function fit(g: CanvasRenderingContext2D, text: string, maxW: number, size: number, min: number, font: (s: number) => string) {
  let s = size;
  g.font = font(s);
  while (s > min && g.measureText(text).width > maxW) {
    s -= 2;
    g.font = font(s);
  }
  return s;
}

function cover(g: CanvasRenderingContext2D, src: HTMLCanvasElement, x: number, y: number, w: number, h: number) {
  const k = Math.max(w / src.width, h / src.height);
  const sw = w / k;
  const sh = h / k;
  g.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, x, y, w, h);
}

/** the little cube on the stamp: three faces in the sticker colours */
function stampCube(g: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const pts = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  const top = [pts(-Math.PI / 2), pts(-Math.PI / 6), [cx, cy] as const, pts((-5 * Math.PI) / 6)];
  const right = [[cx, cy] as const, pts(-Math.PI / 6), pts(Math.PI / 6), [cx, cy + r] as const];
  const left = [[cx, cy] as const, [cx, cy + r] as const, pts((5 * Math.PI) / 6), pts((-5 * Math.PI) / 6)];
  const face = (p: readonly (readonly [number, number])[], fill: string) => {
    g.beginPath();
    g.moveTo(p[0][0], p[0][1]);
    for (const q of p.slice(1)) g.lineTo(q[0], q[1]);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    g.strokeStyle = "rgba(13,11,31,0.85)";
    g.lineWidth = 3;
    g.stroke();
  };
  face(top, "#a78bfa");
  face(left, "#38bdf8");
  face(right, "#f472b6");
}

export function makePostcard(photo: HTMLCanvasElement, spot: PostcardSpot, when = new Date()): HTMLCanvasElement {
  const W = 2100;
  const H = 1400;
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const g = out.getContext("2d")!;
  const mono = getComputedStyle(document.documentElement).getPropertyValue("--font-geist-mono").trim() || "ui-monospace";
  const monoFont = (s: number) => `500 ${s}px ${mono}, ui-monospace, monospace`;
  const hand = (s: number) => `${s}px ${HAND}`;

  // night paper
  const paper = g.createLinearGradient(0, 0, W, H);
  paper.addColorStop(0, "#15112e");
  paper.addColorStop(1, "#0b0a1d");
  g.fillStyle = paper;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(167,139,250,0.35)";
  g.lineWidth = 3;
  g.strokeRect(36, 36, W - 72, H - 72);

  // the picture: a print with a thin light border
  const px = 100, py = 100, pw = 1260, ph = 840;
  g.save();
  g.shadowColor = "rgba(0,0,0,0.55)";
  g.shadowBlur = 40;
  g.shadowOffsetY = 12;
  g.fillStyle = "#e9e5ff";
  g.fillRect(px - 14, py - 14, pw + 28, ph + 28);
  g.restore();
  cover(g, photo, px, py, pw, ph);

  // caption under the picture, handwritten
  const { greeting, detail } = postcardCaption(spot);
  g.textBaseline = "alphabetic";
  g.fillStyle = "#efeaff";
  const gs = fit(g, greeting, pw, 96, 52, hand);
  g.save();
  g.translate(px, py + ph + 150);
  g.rotate(-0.012);
  g.fillText(greeting, 0, 0);
  g.restore();
  if (detail) {
    g.fillStyle = "#b9aef0";
    const ds = fit(g, detail, pw, Math.round(gs * 0.62), 34, hand);
    g.font = hand(ds);
    g.save();
    g.translate(px + 6, py + ph + 150 + ds * 1.5);
    g.rotate(-0.008);
    g.fillText(detail, 0, 0);
    g.restore();
  }

  // right column
  const rx = 1480;
  const rw = W - 100 - rx;

  // stamp (perforated edge), top right
  const sx = W - 100 - 230, sy = 100, sw = 230, sh = 280;
  g.fillStyle = "#e9e5ff";
  g.beginPath();
  const step = 20;
  g.rect(sx, sy, sw, sh);
  g.fill();
  g.fillStyle = "#0b0a1d";
  for (let x = sx; x <= sx + sw; x += step) {
    g.beginPath(); g.arc(x, sy, 7, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(x, sy + sh, 7, 0, Math.PI * 2); g.fill();
  }
  for (let y = sy; y <= sy + sh; y += step) {
    g.beginPath(); g.arc(sx, y, 7, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(sx + sw, y, 7, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = "#1b1640";
  g.fillRect(sx + 20, sy + 20, sw - 40, sh - 40);
  stampCube(g, sx + sw / 2, sy + sh / 2 - 14, 62);
  g.fillStyle = "#cfc6ff";
  g.font = monoFont(17);
  g.textAlign = "center";
  g.fillText("INSIDE THE CUBE", sx + sw / 2, sy + sh - 38);
  g.textAlign = "left";

  // postmark: ring + date, with cancel lines running left over the stamp
  const mx = sx - 66, my = sy + sh / 2 + 30, mr = 104;
  g.strokeStyle = "rgba(244,114,182,0.75)";
  g.fillStyle = "rgba(244,114,182,0.85)";
  g.lineWidth = 5;
  g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 2;
  g.beginPath(); g.arc(mx, my, mr - 12, 0, Math.PI * 2); g.stroke();
  g.textAlign = "center";
  g.font = monoFont(19);
  g.fillText("ISLAND POST", mx, my - 12);
  g.font = monoFont(19);
  g.fillText(when.toLocaleDateString("en", { day: "numeric", month: "short" }).toUpperCase(), mx, my + 14);
  g.fillText(String(when.getFullYear()), mx, my + 38);
  g.textAlign = "left";
  g.lineWidth = 4;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    const y = my - 46 + i * 30;
    g.moveTo(mx - mr - 10, y);
    for (let x = mx - mr - 10; x > mx - mr - 210; x -= 6) g.lineTo(x, y + Math.sin(x / 14) * 6);
    g.stroke();
  }

  // the message
  g.fillStyle = "#efeaff";
  g.font = hand(64);
  const title = wrap(g, `Postcard from ${first}'s island`, rw);
  let ty = 520;
  for (const l of title) {
    g.fillText(l, rx, ty);
    ty += 80;
  }
  g.fillStyle = "#b9aef0";
  g.font = hand(40);
  ty += 14;
  for (const l of wrap(g, "A walk round the town inside the cube on my home page. Real projects, real streets.", rw)) {
    g.fillText(l, rx, ty);
    ty += 54;
  }

  // address lines: the site
  g.strokeStyle = "rgba(185,174,240,0.45)";
  g.lineWidth = 2;
  for (const y of [1130, 1200, 1270]) {
    g.beginPath();
    g.moveTo(rx, y);
    g.lineTo(rx + rw, y);
    g.stroke();
  }
  g.fillStyle = "#efeaff";
  const url = site.url.replace(/^https?:\/\//, "");
  fit(g, url, rw, 44, 24, monoFont);
  g.fillText(url, rx, 1190);
  g.fillStyle = "#b9aef0";
  g.font = hand(34);
  g.fillText(`- ${first}`, rx, 1120);
  return out;
}

/**
 * Offer the picture to the system share sheet, as a file. Returns false when
 * this browser cannot share files (the caller then downloads instead); true
 * once the sheet was used or dismissed by the visitor.
 */
export function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function" || typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [new File([new Blob()], "x.png", { type: "image/png" })] });
  } catch {
    return false;
  }
}

export async function shareCanvas(c: HTMLCanvasElement, name: string, text: string): Promise<"shared" | "cancelled" | "unsupported" | "failed"> {
  if (!canShareFiles()) return "unsupported";
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/png"));
  if (!blob) return "failed";
  const file = new File([blob], name, { type: "image/png" });
  try {
    if (!navigator.canShare({ files: [file] })) return "unsupported";
    await navigator.share({ files: [file], title: `Postcard from ${first}'s island`, text });
    return "shared";
  } catch (e) {
    return e instanceof DOMException && e.name === "AbortError" ? "cancelled" : "failed";
  }
}
