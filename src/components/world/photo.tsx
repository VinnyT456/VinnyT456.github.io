"use client";

import { useImperativeHandle, type Ref } from "react";
import { useThree } from "@react-three/fiber";
import { site } from "@/data/site";

/**
 * Photo mode's camera: a frame drawn on demand and copied straight off the
 * canvas (in the same task, so the drawing buffer hasn't been cleared yet:
 * no need to keep it around every frame with preserveDrawingBuffer).
 */
export type ShutterApi = { capture: () => HTMLCanvasElement };
export function Shutter({ ref }: { ref: Ref<ShutterApi> }) {
  const { gl, scene, camera } = useThree();
  useImperativeHandle(
    ref,
    () => ({
      capture: () => {
        gl.render(scene, camera);
        const src = gl.domElement;
        const out = document.createElement("canvas");
        out.width = src.width;
        out.height = src.height;
        out.getContext("2d")!.drawImage(src, 0, 0);
        return out;
      },
    }),
    [gl, scene, camera]
  );
  return null;
}

/**
 * Tilt-shift, the miniature look: the top and bottom of the picture go soft,
 * the middle stays sharp. The same bands the photo-mode overlay shows, drawn
 * into the picture itself.
 */
export function tiltShift(src: HTMLCanvasElement): HTMLCanvasElement {
  const { width: w, height: h } = src;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const g = out.getContext("2d")!;
  g.drawImage(src, 0, 0);
  const blur = document.createElement("canvas");
  blur.width = w;
  blur.height = h;
  const b = blur.getContext("2d")!;
  b.filter = `blur(${Math.max(2, Math.round(h / 260))}px)`;
  b.drawImage(src, 0, 0);
  b.filter = "none";
  // keep the blur only toward the edges: opaque at top and bottom, gone by a third in
  const fade = b.createLinearGradient(0, 0, 0, h);
  fade.addColorStop(0, "#000");
  fade.addColorStop(0.32, "rgba(0,0,0,0)");
  fade.addColorStop(0.68, "rgba(0,0,0,0)");
  fade.addColorStop(1, "#000");
  b.globalCompositeOperation = "destination-in";
  b.fillStyle = fade;
  b.fillRect(0, 0, w, h);
  g.drawImage(blur, 0, 0);
  return out;
}

/** The site's name in a corner, small, so a shared picture says where it's from. */
export function signPicture(c: HTMLCanvasElement, light: boolean) {
  const g = c.getContext("2d")!;
  const size = Math.max(11, Math.round(c.height / 64));
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-geist-mono").trim() || "ui-monospace";
  g.font = `500 ${size}px ${family}, ui-monospace, monospace`;
  g.textBaseline = "bottom";
  g.fillStyle = light ? "rgba(30,20,60,0.7)" : "rgba(232,228,255,0.75)";
  g.fillText(`Inside the cube · ${site.url.replace(/^https?:\/\//, "")}`, size * 1.4, c.height - size * 1.2);
  return c;
}

/** Hand the visitor a picture as a file. */
export function saveCanvas(c: HTMLCanvasElement, name: string) {
  c.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}
