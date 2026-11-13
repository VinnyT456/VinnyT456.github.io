"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { demoFiles, type Exhibit } from "@/data/museum";
import { Block, TextSign, type Ink } from "./parts";

/**
 * Inside a project's building: a small gallery room with the project's demo
 * playing on the back wall, its name over the screen, and its tools on the
 * walls. Every word is the project's own (the museum's data). The room sits
 * well below the island, out of its sight; the camera is cut down to it
 * behind a fade, so the island never has to be hidden (hiding it would hide
 * its lights, and change the count of lights every shader is built for).
 */

export const ROOM_AT = new THREE.Vector3(0, -26, 0);
/** where the camera stands in the room, and what it looks at (in the room's own frame) */
// off to the right, so the screen sits left of the room's card
export const ROOM_EYE = new THREE.Vector3(0.75, 1.75, 4.7);
export const ROOM_LOOK = new THREE.Vector3(0.7, 1.3, -1);
/** someone's in a room: the walker stays put, the camera's down here */
export const ROOM = { on: false, justLeft: false };

const SCREEN_W = 2.8;
const SCREEN_Y = 1.65;
const POSTER_W = 1.0;
const POSTER_H = POSTER_W / (16 / 9);
const POSTER_FRAME_W = 1.18;
const POSTER_FRAME_H = 0.82;

export default function Room({ exhibit, ink, light, playing }: { exhibit: Exhibit; ink: Ink; light: boolean; playing: boolean }) {
  const folder = exhibit.video;
  // the demo, made only now that someone's come in: its own video element,
  // muted and looping, unloaded again on the way out
  const [demo, setDemo] = useState<{ video: HTMLVideoElement; texture: THREE.VideoTexture } | null>(null);
  const [aspect, setAspect] = useState(16 / 9);
  useEffect(() => {
    if (!folder) return;
    const files = demoFiles(folder);
    const v = document.createElement("video");
    v.src = files.full;
    v.poster = files.poster;
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = "auto";
    const t = new THREE.VideoTexture(v);
    t.colorSpace = THREE.SRGBColorSpace;
    const onMeta = () => v.videoWidth && setAspect(v.videoWidth / v.videoHeight);
    v.addEventListener("loadedmetadata", onMeta);
    // handed over once it can show a frame, so the screen is never blank
    const onData = () => setDemo({ video: v, texture: t });
    v.addEventListener("loadeddata", onData, { once: true });
    v.load();
    return () => {
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("loadeddata", onData);
      v.pause();
      v.removeAttribute("src");
      v.load();
      t.dispose();
      setDemo(null);
    };
  }, [folder]);
  useEffect(() => {
    if (!demo) return;
    if (playing) demo.video.play().catch(() => {});
    else demo.video.pause();
  }, [demo, playing]);
  const texture = demo?.texture ?? null;
  // its poster (the demo's first frame), on the wall
  const [poster, setPoster] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!folder) return;
    let t: THREE.Texture | null = null;
    new THREE.TextureLoader().load(demoFiles(folder).poster, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      t = tex;
      setPoster(tex);
    });
    return () => {
      t?.dispose();
      setPoster(null);
    };
  }, [folder]);

  const sh = SCREEN_W / aspect;
  const accent = exhibit.theme.accent;
  // words on the walls: dark ink on the day's pale walls, pale on the night's dark ones
  const ink_ = light ? "#1c1530" : "#f4f2ff";
  const muted = light ? "#5d5480" : "#b9b2d8";
  const tech = exhibit.technologies.slice(0, 6);
  // the screen's middle: left of centre, clear of the card on the right
  const sx = -0.3;
  const top = SCREEN_Y + sh / 2;
  const bottom = SCREEN_Y - sh / 2;
  // the project's own story for the left wall, its facts and highlights for the right
  const story = useMemo(() => exhibit.stations.slice(0, 3).map((st) => ({ head: st.label, body: st.body })), [exhibit]);
  const notes = useMemo(
    () => [
      ...(exhibit.technical?.facts ?? []).map((f) => ({ head: f.label, body: f.value })),
      ...(exhibit.technical?.metrics ?? []).map((m) => ({ head: m.label, body: m.value })),
      ...(exhibit.technical?.highlights ?? []).slice(0, 3).map((h) => ({ head: "", body: h })),
    ],
    [exhibit]
  );

  return (
    <group position={ROOM_AT}>
      {/* the shell: a dark floor, walls lit a little from within, the ceiling */}
      <Block size={[6.4, 0.1, 9]} color={ink.wall} at={[0, -0.1, 1.35]} roughness={0.85} castShadow={false} />
      <Block size={[6.4, 3.4, 0.12]} color={ink.roof} at={[0, 0, -3.1]} glow={0.55} radius={0.02} castShadow={false} />
      <Block size={[0.12, 3.4, 9]} color={ink.roof} at={[-3.1, 0, 1.35]} glow={0.45} radius={0.02} castShadow={false} />
      <Block size={[0.12, 3.4, 9]} color={ink.roof} at={[3.1, 0, 1.35]} glow={0.45} radius={0.02} castShadow={false} />
      <Block size={[6.4, 0.1, 9]} color={ink.wall} at={[0, 3.4, 1.35]} radius={0.02} castShadow={false} />
      {/* skirting and a crown line in the project's colour */}
      {[0.06, 3.22].map((y) => (
        <Block key={y} size={[6.2, 0.035, 0.02]} color={accent} at={[0, y, -3.03]} glow={0.9 * ink.glow} radius={0.004} castShadow={false} />
      ))}
      {[-1, 1].map((side) => (
        <Block key={side} size={[0.02, 0.035, 8.8]} color={accent} at={[side * 3.03, 0.06, 1.35]} glow={0.9 * ink.glow} radius={0.004} castShadow={false} />
      ))}
      {/* light panels in the ceiling, and the soft light they leave on the floor */}
      {[-1.6, 0, 1.6].map((x) => (
        <group key={x}>
          <Block size={[0.9, 0.02, 4.4]} color="#f5f3ff" at={[x, 3.33, 0.6]} glow={1.1 * ink.glow} radius={0.01} castShadow={false} />
          <Block size={[0.9, 0.004, 4.4]} color="#f5f3ff" at={[x, -0.045, 0.6]} glow={0.12 * ink.glow} radius={0.002} roughness={1} castShadow={false} />
        </group>
      ))}
      {/* a floor plank line or two, so the floor reads as a floor */}
      {[-2.2, -1.1, 1.1, 2.2].map((x) => (
        <Block key={`plank${x}`} size={[0.012, 0.004, 8.8]} color={ink.trim} at={[x, -0.044, 1.35]} radius={0.002} castShadow={false} />
      ))}

      {/* the screen: a dark bezel, the demo, and its colour pooling under it */}
      <Block size={[SCREEN_W + 0.14, sh + 0.14, 0.07]} color="#0b0912" at={[sx, bottom - 0.07, -3.0]} radius={0.035} castShadow={false} />
      {texture ? (
        <mesh position={[sx, SCREEN_Y, -2.955]}>
          <planeGeometry args={[SCREEN_W, sh]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
      ) : null}
      <Block size={[SCREEN_W + 0.3, 0.025, 0.05]} color={accent} at={[sx, bottom - 0.16, -3.0]} glow={1.3 * ink.glow} radius={0.01} castShadow={false} />
      <Block size={[SCREEN_W + 0.6, 0.004, 1.4]} color={accent} at={[sx, -0.043, -2.3]} glow={0.22 * ink.glow} radius={0.002} roughness={1} castShadow={false} />
      <TextSign text={exhibit.title} width={2.6} height={0.22} color={ink_} background={ink.roof} at={[sx, top + 0.28, -3.035]} />
      <TextSign text={`${exhibit.year} · ${exhibit.category}`} width={1.9} height={0.1} color={light ? "#5d5480" : accent} background={ink.roof} at={[sx, bottom - 0.32, -3.035]} />
      {/* its tools, as chips along a ledge under the screen, each edged in the project's colour */}
      <Block size={[SCREEN_W + 0.2, 0.04, 0.16]} color={ink.trim} at={[sx, bottom - 0.72, -2.97]} radius={0.01} castShadow={false} />
      {tech.map((t, i) => {
        const cx = sx + (i - (tech.length - 1) / 2) * 0.47;
        return (
          <group key={t}>
            <Block size={[0.44, 0.13, 0.02]} color={accent} at={[cx, bottom - 0.63, -3.03]} glow={0.35 * ink.glow} radius={0.01} castShadow={false} />
            <TextSign text={t} width={0.42} height={0.11} color={ink_} background={ink.wall} at={[cx, bottom - 0.565, -3.015]} />
          </group>
        );
      })}

      {/* the demo's first frame, framed, left of the screen */}
      {poster ? (
        <group position={[sx - SCREEN_W / 2 - POSTER_FRAME_W / 2 - 0.16, 1.75, -3.0]}>
          <Block size={[POSTER_FRAME_W, POSTER_FRAME_H, 0.08]} color="#0b0912" at={[0, -POSTER_FRAME_H / 2, 0]} radius={0.02} castShadow={false} />
          <mesh position={[0, 0, 0.05]}>
            <planeGeometry args={[POSTER_W, POSTER_H]} />
            <meshBasicMaterial map={poster} toneMapped={false} />
          </mesh>
          <Block size={[POSTER_FRAME_W - 0.1, 0.02, 0.03]} color={accent} at={[0, -POSTER_FRAME_H / 2 - 0.06, 0.03]} glow={0.8 * ink.glow} radius={0.004} castShadow={false} />
        </group>
      ) : null}

      {/* the project's story down the left wall, its facts and highlights on the right */}
      {story.length ? <WallPanel title="The story" items={story} accent={accent} ink={ink} text={ink_} muted={muted} at={[-3.02, 1.65, -1.2]} rotation={[0, Math.PI / 2, 0]} /> : null}
      {notes.length ? <WallPanel title="How it's built" items={notes} accent={accent} ink={ink} text={ink_} muted={muted} at={[3.02, 1.65, -1.2]} rotation={[0, -Math.PI / 2, 0]} /> : null}

      {/* plants in the back corners */}
      {[-2.65, 2.65].map((x) => (
        <group key={`plant${x}`} position={[x, 0, -2.6]}>
          <Block size={[0.34, 0.36, 0.34]} color={ink.trim} at={[0, 0, 0]} radius={0.06} />
          <mesh position={[0, 0.62, 0]}>
            <icosahedronGeometry args={[0.32, 1]} />
            <meshStandardMaterial color={ink.leaf} roughness={0.9} flatShading />
          </mesh>
          <mesh position={[0.12, 0.88, 0.05]}>
            <icosahedronGeometry args={[0.2, 1]} />
            <meshStandardMaterial color={ink.leaf} roughness={0.9} flatShading />
          </mesh>
        </group>
      ))}

      {/* a bench to watch from, on a rug of the project's colour */}
      <Block size={[2.6, 0.012, 1.3]} color={accent} at={[BENCH.x, -0.04, BENCH.z]} radius={0.01} castShadow={false} />
      <Block size={[2.4, 0.014, 1.1]} color={ink.wall} at={[BENCH.x, -0.035, BENCH.z]} radius={0.01} castShadow={false} />
      <group position={[BENCH.x, 0, BENCH.z]}>
        <Block size={[1.5, 0.07, 0.42]} color={ink.trim} at={[0, BENCH.seat - 0.12, 0]} radius={0.02} castShadow={false} />
        <Block size={[1.42, 0.05, 0.38]} color={accent} at={[0, BENCH.seat - 0.05, 0]} radius={0.025} castShadow={false} />
        {[-0.62, 0.62].map((x) => (
          <Block key={x} size={[0.07, BENCH.seat - 0.12, 0.34]} color={ink.column} at={[x, 0, 0]} radius={0.01} castShadow={false} />
        ))}
      </group>
    </group>
  );
}

/** Where the bench is in the room, and how high its seat (the walker sits here). */
export const BENCH = { x: -0.3, z: 0.2, seat: 0.42 };
/** the walker's seat on it: left of middle, so the screen stays in view */
export const ROOM_SEAT = new THREE.Vector3(BENCH.x - 0.52, BENCH.seat, BENCH.z);

/** A panel of the project's own words: a heading, then short entries, wrapped to fit. */
function WallPanel({
  title,
  items,
  accent,
  ink,
  text,
  muted,
  at,
  rotation,
}: {
  title: string;
  items: { head: string; body: string }[];
  accent: string;
  ink: Ink;
  text: string;
  muted: string;
  at: [number, number, number];
  rotation: [number, number, number];
}) {
  const W = 2.3;
  const H = 1.7;
  const texture = useMemo(() => {
    const scale = 420;
    const c = document.createElement("canvas");
    c.width = Math.round(W * scale);
    c.height = Math.round(H * scale);
    const g = c.getContext("2d")!;
    g.fillStyle = ink.roof;
    g.fillRect(0, 0, c.width, c.height);
    const family = getComputedStyle(document.documentElement).getPropertyValue("--font-geist-sans").trim() || "system-ui";
    const pad = 44;
    let y = pad + 34;
    g.fillStyle = accent;
    g.font = `600 40px ${family}, system-ui, sans-serif`;
    g.fillText(title.toUpperCase(), pad, y);
    y += 26;
    const wrap = (str: string, font: string, colour: string, lh: number) => {
      g.font = font;
      g.fillStyle = colour;
      let line = "";
      for (const word of str.split(" ")) {
        const next = line ? `${line} ${word}` : word;
        if (g.measureText(next).width > c.width - pad * 2 && line) {
          y += lh;
          if (y < c.height - pad) g.fillText(line, pad, y);
          line = word;
        } else line = next;
      }
      y += lh;
      if (line && y < c.height - pad) g.fillText(line, pad, y);
    };
    for (const it of items) {
      y += 22;
      if (y > c.height - pad - 40) break;
      if (it.head) wrap(it.head, `600 32px ${family}, system-ui, sans-serif`, text, 40);
      wrap(it.body, `400 29px ${family}, system-ui, sans-serif`, muted, 38);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [title, items, accent, ink.roof, text, muted]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group position={at} rotation={rotation}>
      <Block size={[W + 0.12, H + 0.12, 0.04]} color={ink.trim} at={[0, -(H + 0.12) / 2, -0.01]} radius={0.02} castShadow={false} />
      <mesh position={[0, 0, 0.015]}>
        <planeGeometry args={[W, H]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      <Block size={[W, 0.025, 0.03]} color={accent} at={[0, H / 2 + 0.03, 0.01]} glow={0.9 * ink.glow} radius={0.004} castShadow={false} />
    </group>
  );
}
