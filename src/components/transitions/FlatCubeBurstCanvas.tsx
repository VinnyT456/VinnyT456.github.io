"use client";

import { useEffect, useRef, useLayoutEffect } from "react";
import { CUBE_COLORS } from "@/components/three/cubeColors";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  delay: number;
  spin: number;
};

type Phase = "burst" | "hold" | "open" | "travel";

const BURST_S = 0.82;
/** Short hand-off from the burst into the portal — particles keep moving. */
const HOLD_S = 0.18;
/** Minimum time the portal takes to open. */
const OPEN_S = 0.52;
/** After the new page has committed, give it a beat to settle before revealing. */
const SETTLE_S = 0.14;
/** Never wait on the route longer than this — reveal anyway. */
const MAX_WAIT_S = 3;
/** The reveal itself. */
const TRAVEL_S = 0.9;

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function spawnParticles(count: number, cx: number, cy: number, spread: number) {
  return Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * spread;
    const color = CUBE_COLORS[Math.floor(Math.random() * CUBE_COLORS.length)];
    const speed = 4.2 + Math.random() * 5.8;
    return {
      x: cx + Math.cos(angle) * radius * 0.5,
      y: cy + Math.sin(angle) * radius * 0.5,
      vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 1.2,
      vy: Math.sin(angle) * speed + (Math.random() - 0.5) * 1.2,
      size: 2 + Math.random() * 3.4,
      color,
      delay: Math.random(),
      spin: Math.random() * Math.PI * 2,
    } satisfies Particle;
  });
}

function drawPortal(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  intensity: number,
  time: number,
  traveling: boolean
) {
  if (radius < 2 || intensity <= 0) return;

  const voidGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.12);
  voidGrad.addColorStop(
    0,
    `rgba(4, 4, 7, ${traveling ? 0.88 + intensity * 0.1 : 0.55 + intensity * 0.35})`
  );
  voidGrad.addColorStop(0.55, `rgba(8, 8, 11, ${0.28 + intensity * 0.22})`);
  voidGrad.addColorStop(0.88, `rgba(8, 8, 11, ${0.06 * intensity})`);
  voidGrad.addColorStop(1, "rgba(8, 8, 11, 0)");
  ctx.fillStyle = voidGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.12, 0, Math.PI * 2);
  ctx.fill();

  const rings = [
    { speed: 0.32, tilt: 0.56, scale: 0.88, alpha: 0.32 },
    { speed: -0.26, tilt: 0.5, scale: 0.96, alpha: 0.22 },
  ];
  for (const ring of rings) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(time * ring.speed);
    ctx.scale(1, ring.tilt);
    ctx.strokeStyle = `rgba(167, 139, 250, ${ring.alpha * intensity})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, radius * ring.scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.04, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(167, 139, 250, ${0.12 + intensity * 0.18})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(237, 237, 237, ${0.16 + intensity * 0.22})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

export default function FlatCubeBurstCanvas({
  sessionId,
  arrived,
  onNavigate,
  onReformProgress,
  onDone,
}: {
  sessionId: number;
  /** The destination route has committed underneath the overlay. */
  arrived: boolean;
  onNavigate: () => void;
  onReformProgress: (progress: number) => void;
  onDone: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef<Phase>("burst");
  const particlesRef = useRef<Particle[]>([]);
  const tRef = useRef(0);
  const navigatedRef = useRef(false);
  const rafRef = useRef(0);
  const clockRef = useRef(0);
  const onNavigateRef = useRef(onNavigate);
  const onReformProgressRef = useRef(onReformProgress);
  const onDoneRef = useRef(onDone);
  const arrivedRef = useRef(arrived);
  const arrivedAtRef = useRef<number | null>(null);

  // keep the latest callbacks/flags without re-running the animation effect
  useLayoutEffect(() => {
    onNavigateRef.current = onNavigate;
    onReformProgressRef.current = onReformProgress;
    onDoneRef.current = onDone;
    arrivedRef.current = arrived;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    phaseRef.current = "burst";
    tRef.current = 0;
    clockRef.current = 0;
    navigatedRef.current = false;
    arrivedAtRef.current = null;

    const count = window.matchMedia("(min-width: 768px)").matches ? 1100 : 580;
    const spread = Math.min(window.innerWidth, window.innerHeight) * 0.24;
    const cx = window.innerWidth * 0.5;
    const cy = window.innerHeight * 0.5;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    particlesRef.current = spawnParticles(count, cx, cy, spread);
    window.addEventListener("resize", resize);

    let lastTs = 0;
    const tick = (ts?: number) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const centerX = w * 0.5;
      const centerY = h * 0.5;
      const minDim = Math.min(w, h);
      const phase = phaseRef.current;

      // Real delta time, clamped so a dropped frame or tab-stall can't skip the
      // physics. `f` is "how many 60fps steps this frame is worth" — every
      // per-frame motion/damping below scales by it, so the animation stays
      // smooth and frame-rate independent instead of assuming a perfect 60fps.
      const now = ts ?? 0;
      const rawDt = lastTs ? (now - lastTs) / 1000 : 1 / 60;
      lastTs = now;
      const dt = Math.min(0.05, Math.max(1 / 240, rawDt));
      const f = dt * 60;

      tRef.current += dt;
      clockRef.current += dt;
      ctx.clearRect(0, 0, w, h);

      let portalR = 0;
      let portalIntensity = 0;
      let traveling = false;
      let travelMix = 0;

      if (phase === "burst") {
        for (const p of particlesRef.current) {
          p.x += p.vx * f;
          p.y += p.vy * f;
          p.vx *= Math.pow(0.992, f);
          p.vy *= Math.pow(0.992, f);
        }
        if (tRef.current >= BURST_S) {
          phaseRef.current = "hold";
          tRef.current = 0;
        }
      } else if (phase === "hold") {
        // flow straight into the portal: damping eases off while a gentle pull
        // toward the centre ramps in — no dead stop between burst and portal
        const k = Math.min(tRef.current / HOLD_S, 1);
        for (const p of particlesRef.current) {
          const dx = centerX - p.x;
          const dy = centerY - p.y;
          const dist = Math.hypot(dx, dy) || 1;
          const pull = 0.02 * k;
          p.vx += (dx / dist) * pull * f;
          p.vy += (dy / dist) * pull * f;
          p.x += p.vx * f;
          p.y += p.vy * f;
          p.vx *= Math.pow(0.95, f);
          p.vy *= Math.pow(0.95, f);
        }
        if (tRef.current >= HOLD_S) {
          phaseRef.current = "open";
          tRef.current = 0;
          onReformProgressRef.current(0);
        }
      } else if (phase === "open") {
        // The portal opens, then keeps swirling until the new page is actually
        // there (+ a settle beat), so the reveal never lands on the old page or
        // a half-mounted one.
        if (!navigatedRef.current) {
          navigatedRef.current = true;
          onNavigateRef.current();
        }
        if (arrivedRef.current && arrivedAtRef.current === null) {
          arrivedAtRef.current = clockRef.current;
        }
        const openMix = easeOutCubic(Math.min(tRef.current / OPEN_S, 1));
        portalR = minDim * (0.08 + openMix * 0.1);
        portalIntensity = 0.45 + openMix * 0.55;

        for (const p of particlesRef.current) {
          const dx = centerX - p.x;
          const dy = centerY - p.y;
          const dist = Math.hypot(dx, dy) || 1;
          const angle = Math.atan2(dy, dx);
          const pull = 0.025 + openMix * 0.035;
          const swirl = 0.045 * openMix;
          p.vx += ((dx / dist) * pull + Math.cos(angle + Math.PI / 2) * swirl) * f;
          p.vy += ((dy / dist) * pull + Math.sin(angle + Math.PI / 2) * swirl) * f;
          p.x += p.vx * f;
          p.y += p.vy * f;
          p.vx *= Math.pow(0.9, f);
          p.vy *= Math.pow(0.9, f);
        }

        const settled =
          arrivedAtRef.current !== null &&
          clockRef.current - arrivedAtRef.current >= SETTLE_S;
        if (tRef.current >= OPEN_S && (settled || tRef.current >= OPEN_S + MAX_WAIT_S)) {
          phaseRef.current = "travel";
          tRef.current = 0;
        }
        drawPortal(ctx, centerX, centerY, portalR, portalIntensity, clockRef.current, false);
      } else if (phase === "travel") {
        // Eased at both ends — the reveal accelerates in and settles out instead
        // of ending at full speed (which read as a cut).
        const raw = Math.min(tRef.current / TRAVEL_S, 1);
        traveling = true;
        travelMix = easeInOutCubic(raw);
        portalR = minDim * (0.18 + travelMix * 0.74);
        portalIntensity = 0.55 + travelMix * 0.45;
        onReformProgressRef.current(travelMix);

        for (const p of particlesRef.current) {
          const dx = centerX - p.x;
          const dy = centerY - p.y;
          const dist = Math.hypot(dx, dy) || 1;
          const angle = Math.atan2(dy, dx);
          const pull = 0.055 + travelMix * 0.14;
          const swirl = 0.05 + travelMix * 0.04;
          p.vx += ((dx / dist) * pull + Math.cos(angle + Math.PI / 2) * swirl) * f;
          p.vy += ((dy / dist) * pull + Math.sin(angle + Math.PI / 2) * swirl) * f;
          p.x += p.vx * f;
          p.y += p.vy * f;
          p.vx *= Math.pow(0.86, f);
          p.vy *= Math.pow(0.86, f);
          p.size = Math.max(0.3, p.size * Math.pow(0.992 - travelMix * 0.012, f));
        }

        drawPortal(ctx, centerX, centerY, portalR, portalIntensity, clockRef.current, true);

        if (raw >= 1) {
          onReformProgressRef.current(1);
          cancelAnimationFrame(rafRef.current);
          window.removeEventListener("resize", resize);
          onDoneRef.current();
          return;
        }
      }

      for (const p of particlesRef.current) {
        const dist = Math.hypot(p.x - centerX, p.y - centerY);

        if (phase === "open" || phase === "travel") {
          const inside = portalR > 0 && dist < portalR * (traveling ? 0.92 : 0.62);
          const stagger = traveling
            ? Math.max(0, (travelMix - p.delay * 0.25) / 0.75)
            : 0;
          const alpha = inside
            ? Math.max(0, 0.72 * (1 - stagger * 0.85) - travelMix * 0.35)
            : Math.min(0.82, 0.28 + dist / 520) * (1 - travelMix * 0.65);

          if (alpha < 0.03) continue;

          ctx.beginPath();
          ctx.fillStyle = p.color;
          ctx.globalAlpha = alpha * 0.9;
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }

        const alpha =
          phase === "burst" || phase === "hold"
            ? Math.min(1, 0.25 + dist / 520)
            : 0;

        ctx.beginPath();
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha * 0.88;
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [sessionId]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0"
    />
  );
}
