"use client";

/* eslint-disable react-hooks/immutability -- the game's canvas, its texture and the shared play state are imperative render state. */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CUBE_COLORS } from "@/components/three/cubeColors";
import { Block, TextSign, signInk, type Ink } from "./parts";
import { CABINETS, HIDDEN, MAKERS, demoInput, screenColours } from "./ArcadeGames";
import { H, W, type Game, type Input } from "./arcade-kit";
import { ARCADE_FLOOR, ARCADE_PLAY, ARCADE_SCREENS, BOARD_Z, CABS, CABINET_SCALE, CAB_GAMES, CLAW, CLAW_TRY, HALL, PRIZE } from "./arcade-hall";
import { readBoard, saveBoard, type BoardMode } from "./stamps";

/**
 * The walk-in arcade, built only while you're in it: two rows of cabinets
 * under neon, a carpet down the aisle, the scores on the far wall, the prize
 * counter and the claw machine by the door. Each cabinet's screen shows a
 * still of its game; the one being played runs live on its own screen. No
 * lights of its own (the scene's count never changes): it glows.
 */

const GLOW = ["#34d399", "#a78bfa", "#f59e0b", "#38bdf8", "#facc15", "#f472b6", "#fb923c", "#22d3ee", "#4ade80", "#f43f5e"];
const SCREEN_W = 0.4;
const SCREEN_H = SCREEN_W / (W / H);

/** Where the game being played tells the overlay how it's going. */
export const ARCADE_STATUS = { score: 0, note: "", over: null as { rank: number } | null, listener: null as (() => void) | null };

/** A still of a cabinet's game, a second and a half into a demo, for its screen when nobody's playing. */
function stillOf(id: (typeof CAB_GAMES)[number], dark: boolean) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  if (dark) {
    g.fillStyle = "#07060c";
    g.fillRect(0, 0, W, H);
  } else {
    const game = MAKERS[id]();
    const input: Input = { left: false, right: false, up: false, down: false, action: false };
    let t = 0;
    for (let k = 0; k < 90 && !game.over; k++) {
      t += 1 / 60;
      demoInput(id, t, 1 / 60, input);
      game.step(1 / 60, input);
    }
    game.draw(g, screenColours());
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export default function ArcadeHall({ ink, unlocked }: { ink: Ink; unlocked: boolean }) {
  const sign = signInk(ink);
  // the still on each screen; the hidden cabinet's is dark until it's woken
  const stills = useMemo(() => CAB_GAMES.map((id, i) => stillOf(id, i === 9 && !unlocked)), [unlocked]);
  useEffect(() => () => stills.forEach((t) => t.dispose()), [stills]);
  // the live screen: one canvas, drawn by whichever game is being played
  const live = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return { canvas: c, ctx: c.getContext("2d")!, tex };
  }, []);
  useEffect(() => () => live.tex.dispose(), [live]);
  const screenMats = useMemo(() => stills.map((t) => new THREE.MeshBasicMaterial({ map: t, toneMapped: false })), [stills]);
  const liveMat = useMemo(() => new THREE.MeshBasicMaterial({ map: live.tex, toneMapped: false }), [live]);
  useEffect(() => () => screenMats.forEach((m) => m.dispose()), [screenMats]);
  useEffect(() => () => liveMat.dispose(), [liveMat]);
  const screens = useRef<(THREE.Mesh | null)[]>([]);
  const claw = useRef<THREE.Group>(null);
  const prize = useRef<THREE.Mesh>(null);
  const run = useRef<{ i: number; run: number; game: Game | null; shown: { score: number; note: string } }>({ i: -1, run: -1, game: null, shown: { score: -1, note: "" } });
  const colours = useMemo(() => screenColours(), []);
  // this device's best at each game, for the board
  const bests = useMemo(() => CAB_GAMES.map((id) => readBoard(id as BoardMode)[0]?.score), []);

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const r = run.current;
    const p = ARCADE_PLAY;
    // a game started (or started again) on a cabinet: make it fresh
    if (p.i !== r.i || p.run !== r.run) {
      r.i = p.i;
      r.run = p.run;
      r.game = p.i >= 0 ? MAKERS[CAB_GAMES[p.i]]() : null;
      r.shown = { score: -1, note: "" };
      ARCADE_STATUS.over = null;
      screens.current.forEach((m, k) => {
        if (m) m.material = k === p.i ? liveMat : screenMats[k];
      });
    }
    const game = r.game;
    if (game && p.i >= 0) {
      if (!p.paused && !game.over) {
        game.step(dt, p.input);
        p.input.action = false;
        if (game.over) {
          ARCADE_STATUS.over = { rank: saveBoard(CAB_GAMES[p.i] as BoardMode, { ms: 0, at: Date.now(), score: game.score }) };
          ARCADE_STATUS.listener?.();
        }
      }
      game.draw(live.ctx, colours);
      live.tex.needsUpdate = true;
      if (game.score !== r.shown.score || (game.note ?? "") !== r.shown.note) {
        r.shown = { score: game.score, note: game.note ?? "" };
        ARCADE_STATUS.score = game.score;
        ARCADE_STATUS.note = game.note ?? "";
        ARCADE_STATUS.listener?.();
      }
    }
    // the claw: down, a grab, up; with the prize on a win
    const c = claw.current;
    if (c) {
      const since = CLAW_TRY.t < 0 ? 9 : (performance.now() - CLAW_TRY.t) / 1000;
      const drop = since < 0.8 ? since / 0.8 : since < 1.3 ? 1 : since < 2.1 ? 1 - (since - 1.3) / 0.8 : 0;
      c.position.y = 1.02 - drop * 0.5;
      c.position.x = since < 2.4 ? 0 : Math.sin(clock.elapsedTime * 0.6) * 0.12;
      if (prize.current) prize.current.visible = CLAW_TRY.win && since > 1.3 && since < 3.2;
    }
  });

  const names = CAB_GAMES.map((id) => (id === HIDDEN.id ? HIDDEN.name : (CABINETS.find((c) => c.id === id)?.name ?? id)));

  return (
    <group position={[0, ARCADE_FLOOR, 0]}>
      <group userData={{ batch: true }}>
        {/* the room: a dark floor, walls lit a little from within, the ceiling */}
        <Block size={[HALL.hw * 2 + 0.2, 0.1, HALL.hd * 2 + 0.2]} color={ink.wall} at={[0, -0.1, 0]} castShadow={false} />
        <Block size={[HALL.hw * 2 + 0.2, 0.1, HALL.hd * 2 + 0.2]} color={ink.roof} at={[0, HALL.h, 0]} castShadow={false} />
        {[-1, 1].map((s) => (
          <Block key={`wx${s}`} size={[0.1, HALL.h, HALL.hd * 2]} color={ink.roof} at={[s * (HALL.hw + 0.05), 0, 0]} glow={0.3} castShadow={false} />
        ))}
        <Block size={[HALL.hw * 2, HALL.h, 0.1]} color={ink.roof} at={[0, 0, -HALL.hd - 0.05]} glow={0.3} castShadow={false} />
        {/* the front wall, either side of the door */}
        {[-1, 1].map((s) => (
          <Block key={`wd${s}`} size={[HALL.hw - 0.45, HALL.h, 0.1]} color={ink.roof} at={[s * (HALL.hw / 2 + 0.22), 0, HALL.hd + 0.05]} glow={0.3} castShadow={false} />
        ))}
        <Block size={[0.9, HALL.h - 1.1, 0.1]} color={ink.roof} at={[0, 1.1, HALL.hd + 0.05]} castShadow={false} />
        <Block size={[0.86, 1.08, 0.02]} color="#fde7b0" at={[0, 0, HALL.hd + 0.0]} glow={0.5 * ink.glow} castShadow={false} />
        <TextSign text="EXIT · NIGHT MARKET" width={0.8} height={0.09} color={sign.mint} background={ink.roof} at={[0, 1.2, HALL.hd - 0.004]} rotation={[0, Math.PI, 0]} />
        {/* Wall rails, ceiling ribs and aisle markers add scale to the small room. */}
        {[-1, 1].map((s) => (
          <Block key={`rail${s}`} size={[0.08, 0.18, HALL.hd * 2 - 0.3]} color={ink.trim} at={[s * (HALL.hw - 0.08), 0.02, 0]} radius={0.025} castShadow={false} />
        ))}
        {[-4, -2, 0, 2, 4].map((z) => (
          <Block key={`rib${z}`} size={[HALL.hw * 2 - 0.2, 0.07, 0.12]} color={ink.trim} at={[0, HALL.h - 0.22, z]} radius={0.02} castShadow={false} />
        ))}
        {[-1, 1].map((s) => (
          <Block key={`wallline${s}`} size={[0.025, 0.025, HALL.hd * 2 - 0.8]} color={s < 0 ? "#f472b6" : "#67e8f9"} at={[s * (HALL.hw - 0.08), 1.72, 0]} glow={0.8 * ink.glow} radius={0.01} castShadow={false} />
        ))}
        {[-1, 1].flatMap((side) => [-3.55, -0.35, 2.65].map((z, i) => (
          <group key={`poster${side}-${i}`}>
            <Block size={[0.035, 0.38, 0.62]} color={i % 2 ? "#171326" : ink.wall} at={[side * (HALL.hw - 0.015), 1.03, z]} radius={0.025} castShadow={false} />
            <TextSign
              text={["PLAY", "CUBE CITY", "1UP"][i]}
              width={0.48}
              height={0.12}
              color={i % 2 ? "#67e8f9" : "#f472b6"}
              background="#171326"
              at={[side * (HALL.hw - 0.035), 1.1, z]}
              rotation={[0, side < 0 ? Math.PI / 2 : -Math.PI / 2, 0]}
            />
          </group>
        )))}
        {/* a carpet down the aisle, its pattern in the cube's colours */}
        <Block size={[1.5, 0.012, HALL.hd * 2 - 0.4]} color="#1e1b4b" at={[0, -0.04, 0]} castShadow={false} />
        {[-0.72, 0.72].map((x, i) => (
          <Block key={`runneredge${x}`} size={[0.025, 0.008, HALL.hd * 2 - 0.5]} color={i ? "#67e8f9" : "#f472b6"} at={[x, -0.027, 0]} glow={0.35 * ink.glow} radius={0.008} castShadow={false} />
        ))}
        {Array.from({ length: 12 }, (_, k) => (
          <Block key={`dot${k}`} size={[0.08, 0.004, 0.08]} color={CUBE_COLORS[k % CUBE_COLORS.length]} at={[k % 2 ? 0.4 : -0.4, -0.028, -HALL.hd + 0.8 + k * 0.72]} rotation={[0, Math.PI / 4, 0]} castShadow={false} />
        ))}
        {/* neon down both walls and across the ceiling */}
        {[-1, 1].map((s) => (
          <Block key={`n${s}`} size={[0.03, 0.03, HALL.hd * 2 - 0.2]} color={s < 0 ? "#f472b6" : "#67e8f9"} at={[s * (HALL.hw - 0.02), 1.55, 0]} glow={1.4 * ink.glow} castShadow={false} />
        ))}
        {[-3, -1, 1, 3].map((z) => (
          <Block key={`c${z}`} size={[1.2, 0.02, 0.12]} color="#ece8ff" at={[0, HALL.h - 0.03, z]} glow={1.1 * ink.glow} castShadow={false} />
        ))}

        {/* the cabinets: a body, a marquee in the game's colour, a control deck, its name */}
        {CABS.map((cab, i) => {
          const dead = i === 9 && !unlocked;
          const glow = dead ? ink.roof : GLOW[i];
          return (
            <group key={i} position={[cab.x, 0, cab.z]} rotation={[0, cab.face > 0 ? Math.PI / 2 : -Math.PI / 2, 0]} scale={CABINET_SCALE}>
              <Block size={[0.6, 1.0, 0.5]} color={ink.wallAlt} at={[0, 0, -0.02]} radius={0.03} />
              <Block size={[0.62, 0.04, 0.52]} color={glow} at={[0, 1.0, -0.02]} glow={dead ? 0 : 0.8 * ink.glow} castShadow={false} />
              <Block size={[0.56, 0.13, 0.05]} color={glow} at={[0, 0.86, 0.24]} glow={dead ? 0 : 1.1 * ink.glow} castShadow={false} />
              <TextSign text={names[i].toUpperCase()} width={0.52} height={0.08} color={dead ? "#4b4560" : "#0b0912"} background={dead ? "#16141f" : glow} at={[0, 0.925, 0.27]} />
              {/* the screen's bezel; the screen itself sits in it, tilted back */}
              <Block size={[SCREEN_W + 0.06, SCREEN_H + 0.06, 0.03]} color="#07060c" at={[0, 0.62 - (SCREEN_H + 0.06) / 2, 0.235]} rotation={[-0.12, 0, 0]} castShadow={false} />
              <Block size={[0.58, 0.05, 0.22]} color={ink.trim} at={[0, 0.42, 0.3]} rotation={[0.35, 0, 0]} radius={0.01} castShadow={false} />
              <mesh position={[0.105, 0.46, 0.335]} rotation={[0.35, 0, 0]}>
                <cylinderGeometry args={[0.018, 0.025, 0.055, 10]} />
                <meshStandardMaterial color={ink.column} roughness={0.35} metalness={0.25} />
              </mesh>
              <mesh position={[0.105, 0.49, 0.335]}>
                <sphereGeometry args={[0.034, 10, 8]} />
                <meshStandardMaterial color="#f472b6" roughness={0.22} metalness={0.08} />
              </mesh>
              {[-0.1, 0.02].map((bx, k) => (
                <Block key={`button${bx}`} size={[0.045, 0.025, 0.045]} color={k ? "#67e8f9" : "#facc15"} at={[bx, 0.47, 0.34]} radius={0.018} castShadow={false} />
              ))}
              <Block size={[0.13, 0.055, 0.012]} color="#0b0912" at={[0, 0.15, 0.25]} radius={0.008} castShadow={false} />
              <Block size={[0.075, 0.012, 0.01]} color={dead ? "#4b4560" : glow} at={[0, 0.1, 0.258]} glow={dead ? 0 : 0.3 * ink.glow} radius={0.004} castShadow={false} />
              {[-0.12, 0.05, 0.14].map((bx, k) => (
                <Block key={bx} size={[0.035, 0.02, 0.035]} color={k === 0 ? ink.column : GLOW[(i + k) % GLOW.length]} at={[bx, 0.465, 0.33]} rotation={[0.35, 0, 0]} radius={0.01} castShadow={false} />
              ))}
              {dead ? (
                <>
                  {[-0.5, 0.5].map((r) => (
                    <Block key={r} size={[0.48, 0.03, 0.01]} color="#facc15" at={[0, 0.6, 0.27]} rotation={[0, 0, r]} castShadow={false} />
                  ))}
                  <Block size={[0.08, 0.09, 0.006]} color="#f4f2ff" at={[0.1, 0.5, 0.272]} rotation={[0, 0, 0.12]} castShadow={false} />
                </>
              ) : null}
              {/* its light on the floor in front */}
              {dead ? null : <Block size={[0.5, 0.004, 0.45]} color={glow} at={[0, -0.03, 0.5]} glow={0.25 * ink.glow} castShadow={false} />}
            </group>
          );
        })}

        {/* the scores, on the far wall */}
        <Block size={[2.6, 1.3, 0.05]} color="#07060c" at={[0, 0.85, BOARD_Z + 0.02]} radius={0.02} castShadow={false} />
        <Block size={[2.64, 0.03, 0.06]} color="#a78bfa" at={[0, 2.16, BOARD_Z + 0.03]} glow={1.2 * ink.glow} castShadow={false} />
        <TextSign text="HIGH SCORES · THIS DEVICE" width={2.2} height={0.13} color="#f472b6" background="#07060c" at={[0, 2.0, BOARD_Z + 0.05]} />
        {CAB_GAMES.map((_, i) => (
          <TextSign
            key={i}
            text={`${names[i].toUpperCase().padEnd(16, " ")} ${i === 9 && !unlocked ? "?????" : bests[i] !== undefined ? String(bests[i]).padStart(5, " ") : "  ---"}`}
            width={1.2}
            height={0.09}
            color={GLOW[i]}
            background="#07060c"
            at={[i < 5 ? -0.64 : 0.64, 1.8 - (i % 5) * 0.2, BOARD_Z + 0.05]}
          />
        ))}

        {/* the prize counter: a glass case of prizes, a sign over it */}
        <group position={[PRIZE.x, 0, PRIZE.z]}>
          <Block size={[PRIZE.hw * 2, 0.55, PRIZE.hd * 2]} color={ink.wallAlt} at={[0, 0, 0]} radius={0.02} />
          <Block size={[PRIZE.hw * 2 + 0.04, 0.03, PRIZE.hd * 2 + 0.04]} color="#fde7b0" at={[0, 0.55, 0]} glow={0.5 * ink.glow} castShadow={false} />
          {[-0.4, -0.15, 0.1, 0.35].map((z, k) => (
            <Block key={z} size={[0.1, 0.1, 0.1]} color={CUBE_COLORS[k + 1]} at={[0.1, 0.58, z]} radius={0.02} castShadow={false} />
          ))}
          <TextSign text="PRIZES" width={0.5} height={0.11} color={sign.warm} background={ink.roof} at={[0.43, 0.38, 0]} rotation={[0, Math.PI / 2, 0]} />
        </group>

        {/* the claw machine: a glass box of plush cubes, its claw on a gantry */}
        <group position={[CLAW.x, 0, CLAW.z]}>
          <Block size={[CLAW.hw * 2, 0.5, CLAW.hd * 2]} color="#db2777" at={[0, 0, 0]} radius={0.03} />
          <Block size={[CLAW.hw * 2, 0.08, CLAW.hd * 2]} color="#db2777" at={[0, 1.15, 0]} radius={0.02} />
          {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Block key={`${sx}${sz}`} size={[0.03, 0.65, 0.03]} color={ink.column} at={[sx * (CLAW.hw - 0.02), 0.5, sz * (CLAW.hd - 0.02)]} castShadow={false} />))}
          {Array.from({ length: 9 }, (_, k) => (
            <Block key={k} size={[0.11, 0.11, 0.11]} color={CUBE_COLORS[k % CUBE_COLORS.length]} at={[((k % 3) - 1) * 0.2, 0.5, (Math.floor(k / 3) - 1) * 0.2]} rotation={[0, k * 0.7, k * 0.3]} radius={0.04} castShadow={false} />
          ))}
          <TextSign text="CUBE CATCHER" width={0.6} height={0.09} color="#fdf2f8" background="#9d174d" at={[-CLAW.hw - 0.004, 1.19, 0]} rotation={[0, -Math.PI / 2, 0]} />
        </group>
      </group>

      {/* the glass of the claw machine, and its claw (which moves) */}
      <mesh position={[CLAW.x, 0.82, CLAW.z]} userData={{ noFade: true }}>
        <boxGeometry args={[CLAW.hw * 2 - 0.02, 0.62, CLAW.hd * 2 - 0.02]} />
        <meshStandardMaterial color={ink.glass} transparent opacity={0.18} depthWrite={false} roughness={0.05} />
      </mesh>
      <group position={[CLAW.x, 0, CLAW.z]} userData={{ dynamic: true }}>
        <group ref={claw} position={[0, 1.02, 0]}>
          <Block size={[0.012, 0.14, 0.012]} color={ink.column} at={[0, 0, 0]} castShadow={false} />
          {[0, 2.1, 4.2].map((a) => (
            <Block key={a} size={[0.012, 0.06, 0.012]} color="#e5e7eb" at={[Math.sin(a) * 0.03, -0.04, Math.cos(a) * 0.03]} rotation={[Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4]} castShadow={false} />
          ))}
          <mesh ref={prize} position={[0, -0.08, 0]} visible={false}>
            <boxGeometry args={[0.1, 0.1, 0.1]} />
            <meshStandardMaterial color="#a78bfa" emissive="#a78bfa" emissiveIntensity={0.4} />
          </mesh>
        </group>
      </group>

      {/* the screens: each a still of its game, or the game itself while it's played */}
      <group userData={{ dynamic: true }}>
        {CABS.map((cab, i) => (
          <group key={i} position={[cab.x, 0, cab.z]} rotation={[0, cab.face > 0 ? Math.PI / 2 : -Math.PI / 2, 0]} scale={CABINET_SCALE}>
            <mesh
              ref={(el) => {
                screens.current[i] = el;
                ARCADE_SCREENS[i] = el;
              }}
              position={[0, 0.62 - (SCREEN_H + 0.06) / 2 + (SCREEN_H + 0.06) / 2, 0.255]}
              rotation={[-0.12, 0, 0]}
              material={screenMats[i]}
              userData={{ noFade: true }}
            >
              <planeGeometry args={[SCREEN_W, SCREEN_H]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}
