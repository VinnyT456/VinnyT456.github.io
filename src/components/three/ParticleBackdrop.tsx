"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import * as THREE from "three";
import {
  handoffComplete,
  subscribeHandoffComplete,
} from "@/lib/intro";
import { useReducedMotion } from "@/lib/media";

let colorProbe: CanvasRenderingContext2D | null = null;

/** Three.Color.parseStyle does not understand lab()/oklch(); canvas does. */
function cssToHex(css: string, fallback: string) {
  const value = css.trim() || fallback;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) return value;

  if (!colorProbe) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    colorProbe = canvas.getContext("2d", { willReadFrequently: true });
  }
  if (!colorProbe) return fallback;

  colorProbe.clearRect(0, 0, 1, 1);
  colorProbe.fillStyle = value;
  colorProbe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = colorProbe.getImageData(0, 0, 1, 1).data;
  if (a === 0) return fallback;
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function cssHex(name: string, fallback: string) {
  return cssToHex(
    getComputedStyle(document.documentElement).getPropertyValue(name),
    fallback
  );
}

function makeRand(seed: number) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

const FOV = 50;
const CAMERA_Z = 9;
const NEAR_DEPTH = 5;
const FAR_DEPTH = 26;
/** Frustum share kept offscreen so wrapping and parallax never expose an edge. */
const MARGIN = 0.16;
const MAX_PIXEL_RATIO = 1.5;

/**
 * Each particle stores a slot in the view frustum — (u, v, depth01) — rather
 * than a world position. The shader maps it to the frustum every frame, so the
 * field always fills the viewport at any aspect ratio and can wrap forever.
 */
function buildField(starCount: number, moteCount: number) {
  const rand = makeRand(7711);
  const gauss = () => rand() + rand() + rand() - 1.5;
  const total = starCount + moteCount;
  const cells = new Float32Array(total * 3);
  const seeds = new Float32Array(total);
  const sizes = new Float32Array(total);
  const kinds = new Float32Array(total);

  const clusters = Array.from({ length: 7 }, () => ({
    u: rand(),
    v: rand(),
    depth: 0.25 + rand() * 0.7,
    spread: 0.08 + rand() * 0.12,
  }));

  for (let i = 0; i < starCount; i++) {
    let u = rand();
    let v = rand();
    // Biased toward the far end: most stars sit deep, few come close.
    let depth = Math.pow(rand(), 0.6);
    if (rand() < 0.3) {
      const cluster = clusters[Math.floor(rand() * clusters.length)];
      u = cluster.u + gauss() * cluster.spread;
      v = cluster.v + gauss() * cluster.spread;
      depth = Math.min(1, Math.max(0.05, cluster.depth + gauss() * 0.12));
    }
    cells[i * 3] = u - Math.floor(u);
    cells[i * 3 + 1] = v - Math.floor(v);
    cells[i * 3 + 2] = depth;
    seeds[i] = rand();
    sizes[i] = 2 + rand() * rand() * 3;
  }

  for (let i = starCount; i < total; i++) {
    cells[i * 3] = rand();
    cells[i * 3 + 1] = rand();
    cells[i * 3 + 2] = rand() * 0.08;
    seeds[i] = rand();
    sizes[i] = 16 + rand() * 26;
    kinds[i] = 1;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(cells, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aKind", new THREE.BufferAttribute(kinds, 1));
  return geometry;
}

function makeMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    // Normal, not additive: overlapping stars must not bloom into a glowing field.
    blending: THREE.NormalBlending,
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uColorNear: { value: new THREE.Color("#8b8bff") },
      uColorFar: { value: new THREE.Color("#5b7bd6") },
      uPixelRatio: { value: 1 },
      uReduced: { value: 0 },
      uFade: { value: 0 },
      uIntensity: { value: 1 },
      uBoost: { value: 0 },
      uScroll: { value: 0 },
      uAspect: { value: 1 },
      uTanHalf: { value: Math.tan(THREE.MathUtils.degToRad(FOV / 2)) },
    },
    vertexShader: `
      attribute float aSeed;
      attribute float aSize;
      attribute float aKind;

      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uReduced;
      uniform float uFade;
      uniform float uIntensity;
      // 0..1 — lifts the dim floor and size so the sky is actually visible.
      uniform float uBoost;
      // Eased page scroll in viewport heights (home only; 0 elsewhere).
      uniform float uScroll;
      uniform float uAspect;
      uniform float uTanHalf;

      varying float vAlpha;
      varying float vBright;
      varying float vDepth;
      varying float vKind;

      const float NEAR_DEPTH = ${NEAR_DEPTH.toFixed(1)};
      const float FAR_DEPTH = ${FAR_DEPTH.toFixed(1)};
      const float MARGIN = ${MARGIN.toFixed(2)};
      const float CAMERA_Z = ${CAMERA_Z.toFixed(1)};

      void main() {
        float t = uTime * (1.0 - uReduced);
        float depth01 = position.z;
        float depth = mix(NEAR_DEPTH, FAR_DEPTH, depth01);
        // Near stars drift a little faster than far ones. On home they also
        // rise with the (eased) scroll, near ones more: depth parallax.
        float parallax = NEAR_DEPTH / depth;

        float u = position.x + t * 0.0022 * parallax
          + sin(t * 0.05 + aSeed * 40.0) * 0.0015;
        float v = position.y + cos(t * 0.04 + aSeed * 23.0) * 0.0012
          + uScroll * 0.35 * parallax;
        u = fract(u);
        v = fract(v);

        float halfH = depth * uTanHalf * (1.0 + MARGIN);
        float halfW = halfH * uAspect;
        vec3 p = vec3((u * 2.0 - 1.0) * halfW, (v * 2.0 - 1.0) * halfH, CAMERA_Z - depth);

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;

        float bright = pow(aSeed, 2.6);
        float size;
        float alpha;
        if (aKind > 0.5) {
          size = aSize;
          alpha = 0.06 * (1.0 + 0.6 * uBoost);
        } else {
          size = max(aSize * mix(1.45, 0.6, depth01) * (1.0 + bright * 1.6) * (1.0 + 0.9 * uBoost), 1.6);
          float scintillate = sin(t * (0.6 + aSeed) + aSeed * 50.0) * sin(t * 0.37 + aSeed * 17.0);
          float twinkle = 1.0 + scintillate * 0.35 * smoothstep(0.55, 0.95, aSeed);
          alpha = mix(0.07 + 0.28 * uBoost, 0.62 + 0.3 * uBoost, bright)
            * mix(1.0, 0.42, depth01) * twinkle;
        }
        gl_PointSize = size * uPixelRatio;

        vAlpha = alpha * uFade * uIntensity;
        vBright = bright;
        vDepth = depth01;
        vKind = aKind;
      }
    `,
    fragmentShader: `
      uniform vec3 uColorNear;
      uniform vec3 uColorFar;
      uniform float uBoost;

      varying float vAlpha;
      varying float vBright;
      varying float vDepth;
      varying float vKind;

      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float r2 = dot(c, c) * 4.0;
        if (r2 > 1.0) discard;

        float shape;
        if (vKind > 0.5) {
          shape = smoothstep(1.0, 0.55, r2);
        } else {
          float core = exp(-r2 * mix(5.0, 11.0, vBright));
          float halo = exp(-r2 * 3.0) * 0.3 * vBright;
          shape = (core + halo) * smoothstep(1.0, 0.7, r2);
        }

        float alpha = shape * vAlpha;
        if (alpha < 0.008) discard;
        vec3 color = mix(uColorNear, uColorFar, vDepth);
        color = mix(color, vec3(0.93, 0.94, 1.0), clamp(0.3 * uBoost + 0.35 * vBright, 0.0, 0.8));
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
}

function useBackdropShow(isHome: boolean) {
  return useSyncExternalStore(
    subscribeHandoffComplete,
    () => !isHome || handoffComplete(),
    () => !isHome
  );
}

/**
 * Per-page atmosphere intensity. Home is the visual entry point so it breathes
 * a little more; content-heavy pages stay quiet so the field never competes
 * with what you're reading. One shared field, dialed down contextually.
 */
function intensityForPath(pathname: string): number {
  if (pathname === "/") return 0.95;
  if (pathname === "/experience") return 0.32;
  if (pathname === "/about") return 0.36;
  if (pathname === "/projects") return 0.34;
  return 0.5;
}

function applyParticleColors(material: THREE.ShaderMaterial) {
  material.uniforms.uColorNear.value.set(cssHex("--particle", "#8b8bff"));
  material.uniforms.uColorFar.value.set("#5b7bd6");
}

export default function ParticleBackdrop() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  const isHomeRef = useRef(isHome);
  const show = useBackdropShow(isHome);
  const intensity = intensityForPath(pathname);
  const intensityRef = useRef(intensity);
  const kickRef = useRef<() => void>(() => {});

  useEffect(() => {
    reducedRef.current = reduced;
    kickRef.current();
  }, [reduced]);

  useEffect(() => {
    isHomeRef.current = isHome;
    intensityRef.current = intensity;
    kickRef.current();
  }, [isHome, intensity]);

  useEffect(() => {
    if (!show) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const desktop = window.matchMedia("(min-width: 1024px) and (pointer: fine)").matches;
    const tablet = window.matchMedia("(min-width: 768px)").matches;
    const starCount = desktop ? 1500 : tablet ? 1000 : 550;
    const moteCount = desktop ? 14 : tablet ? 8 : 0;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      powerPreference: "low-power",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);
    camera.position.set(0, 0, CAMERA_Z);

    const geometry = buildField(starCount, moteCount);
    const material = makeMaterial();
    applyParticleColors(material);
    const points = new THREE.Points(geometry, material);
    // Positions are frustum slots resolved in the shader; the bounding sphere is meaningless.
    points.frustumCulled = false;
    scene.add(points);

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setPixelRatio(
        Math.min(window.devicePixelRatio, downgraded ? 1 : MAX_PIXEL_RATIO)
      );
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      material.uniforms.uAspect.value = w / h;
      material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
      start();
    };

    // The sky ignores the cursor. On home only, it follows scrolling as a
    // depth parallax: the target is the real scroll position, and the shader
    // offset eases toward it each frame so the stars glide on and settle after
    // the page stops. Off home the offset holds (no slide on route change);
    // reduced motion never moves it.
    let scrollTarget = 0;
    let scrollMix = 0;
    const onScroll = () => {
      if (!isHomeRef.current || reducedRef.current) return;
      scrollTarget = window.scrollY / Math.max(window.innerHeight, 1);
      start();
    };

    let partyUntil = 0;
    let partyMix = 0;
    const onParty = () => {
      if (reducedRef.current) return;
      partyUntil = performance.now() + 6000;
      start();
    };

    let fade = 0;
    let intensityMix = intensityRef.current;
    let raf = 0;
    let running = false;
    let last = 0;
    let startedAt = 0;
    let downgraded = false;
    let sampled = 0;
    let slowFrames = 0;

    function start() {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      last = performance.now();
      if (!startedAt) startedAt = last;
      raf = requestAnimationFrame(tick);
    }

    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }

    function sampleFrameCost(now: number, rawDelta: number) {
      if (downgraded || now - startedAt < 2000) return;
      sampled += 1;
      if (rawDelta > 1 / 45) slowFrames += 1;
      if (sampled < 120) return;
      if (slowFrames > 40 && renderer.getPixelRatio() > 1) {
        downgraded = true;
        resize();
      }
      downgraded = true;
    }

    function tick(now: number) {
      if (!running) return;
      const rawDelta = (now - last) / 1000;
      const delta = Math.min(rawDelta, 1 / 30);
      last = now;
      const isReduced = reducedRef.current;
      if (!isReduced) sampleFrameCost(now, rawDelta);

      const partyTarget = now < partyUntil ? 1 : 0;
      partyMix += (partyTarget - partyMix) * Math.min(delta * 3, 1);
      if (isReduced) scrollTarget = scrollMix = 0;
      scrollMix += (scrollTarget - scrollMix) * Math.min(delta * 3.2, 1);
      fade += (1 - fade) * Math.min(delta * 2.2, 1);
      intensityMix +=
        (intensityRef.current - intensityMix) * Math.min(delta * 1.6, 1);
      // Home gets a steady, clearly visible sky; other pages a gentle base.
      const home = isHomeRef.current;

      const uniforms = material.uniforms;
      uniforms.uTime.value = now * 0.001;
      uniforms.uReduced.value = isReduced ? 1 : 0;
      uniforms.uFade.value = fade;
      uniforms.uBoost.value = home ? 0.8 : 0.3;
      uniforms.uScroll.value = scrollMix;
      uniforms.uIntensity.value = intensityMix + partyMix * 0.35 + (home ? 0.15 : 0);

      renderer.render(scene, camera);

      const settled =
        fade > 0.998 &&
        Math.abs(intensityRef.current - intensityMix) < 0.002 &&
        partyMix < 0.002;
      if (isReduced && settled) {
        stop();
        return;
      }
      raf = requestAnimationFrame(tick);
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    window.addEventListener("resize", resize);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("workshop:party", onParty);
    document.addEventListener("visibilitychange", onVisibility);
    kickRef.current = start;
    resize();

    return () => {
      stop();
      kickRef.current = () => {};
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("workshop:party", onParty);
      document.removeEventListener("visibilitychange", onVisibility);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, [show]);

  if (!show) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[2] h-full w-full"
    />
  );
}
