"use client";

import { useEffect, useRef } from "react";
import { CUBE_COLORS } from "@/components/three/cubeColors";
import { useReducedMotion } from "@/lib/media";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
};

const DURATION_S = 0.75;

function spawnBurst(count: number, cx: number, cy: number) {
  return Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2.4 + Math.random() * 4.8;
    return {
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 1.4 + Math.random() * 2.6,
      color: CUBE_COLORS[Math.floor(Math.random() * CUBE_COLORS.length)],
      life: 0.55 + Math.random() * 0.45,
    } satisfies Particle;
  });
}

export default function CubeNavBurst({
  trigger,
  big = false,
}: {
  trigger: number;
  big?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!trigger || reduced) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio, 2);
    const size = big ? 220 : 160;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = size * 0.5;
    const cy = size * 0.5;
    const count = big ? 90 : 56;
    const particles = spawnBurst(count, cx, cy);
    let t = 0;
    let raf = 0;

    const tick = () => {
      t += 1 / 60;
      ctx.clearRect(0, 0, size, size);

      let alive = 0;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.life -= 1 / 60 / DURATION_S;
        if (p.life <= 0) continue;
        alive++;

        ctx.beginPath();
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.min(1, p.life * 1.2);
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (t < DURATION_S && alive > 0) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [big, reduced, trigger]);

  if (reduced) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="cube-nav-burst"
      // 0×0 until a burst sizes it, instead of the default 300×150 box
      width={0}
      height={0}
    />
  );
}
