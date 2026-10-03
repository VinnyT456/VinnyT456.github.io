"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import * as THREE from "three";
import { CUBE_COLORS } from "@/components/three/cubeColors";

// Sticker palette — the workshop cube colors, one per face.
// Same as CUBE_COLORS except -Z: the solver swaps dark slate for lavender so
// every face reads clearly against its near-black plastic.
const FACE_COLORS: Record<string, string> = {
  R: CUBE_COLORS[0], // +X purple
  L: CUBE_COLORS[1], // -X blue
  U: CUBE_COLORS[2], // +Y white
  D: CUBE_COLORS[3], // -Y indigo
  F: CUBE_COLORS[4], // +Z sky
  B: "#a78bfa", // -Z lavender (the accent)
};
const PLASTIC = "#0b0b12";

export type CubeFace = "U" | "D" | "L" | "R" | "F" | "B";

export type RubikHandle = {
  scramble: () => void;
  reset: () => void;
  turn: (face: CubeFace, prime: boolean) => void;
};

// Each face → the world axis, the layer on that axis, and the sign that makes a
// non-primed turn read clockwise when looking at that face from outside.
const FACE_TURN: Record<CubeFace, { axis: Axis; layer: number; cw: 1 | -1 }> = {
  R: { axis: "x", layer: 1, cw: -1 },
  L: { axis: "x", layer: -1, cw: 1 },
  U: { axis: "y", layer: 1, cw: -1 },
  D: { axis: "y", layer: -1, cw: 1 },
  F: { axis: "z", layer: 1, cw: -1 },
  B: { axis: "z", layer: -1, cw: 1 },
};

type Axis = "x" | "y" | "z";

const CUBIE = 1;
const GAP = 0.06;
const STEP = CUBIE + GAP;

function almost(a: number, b: number) {
  return Math.abs(a - b) < 0.35;
}

export default function RubikCube({
  ref,
  onMove,
  onSolved,
  onReady,
}: {
  ref?: Ref<RubikHandle>;
  onMove?: (count: number) => void;
  onSolved?: () => void;
  onReady?: () => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<RubikHandle | null>(null);

  useImperativeHandle(ref, () => ({
    scramble: () => apiRef.current?.scramble(),
    reset: () => apiRef.current?.reset(),
    turn: (face, prime) => apiRef.current?.turn(face, prime),
  }));

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.cursor = "grab";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(4.6, 4.4, 6.4);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.86));
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(6, 9, 7);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x99aaff, 0.5);
    rim.position.set(-6, -3, -5);
    scene.add(rim);

    // The whole cube lives under a group we orbit with empty-space drags.
    const world = new THREE.Group();
    scene.add(world);
    world.rotation.set(-0.18, -0.5, 0);

    // ---- Build 27 cubies with per-face sticker colors -------------------
    type Cubie = { mesh: THREE.Mesh };
    const cubies: Cubie[] = [];
    const rounded = new THREE.BoxGeometry(CUBIE, CUBIE, CUBIE);

    function stickerMaterials(x: number, y: number, z: number) {
      // order: +x, -x, +y, -y, +z, -z
      const mk = (hex: string, lit: boolean) =>
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(hex),
          roughness: lit ? 0.34 : 0.6,
          metalness: 0.04,
          // colored stickers glow faintly so faces read on the dark stage
          emissive: lit ? new THREE.Color(hex) : new THREE.Color("#000000"),
          emissiveIntensity: lit ? 0.14 : 0,
        });
      return [
        mk(x === 1 ? FACE_COLORS.R : PLASTIC, x === 1),
        mk(x === -1 ? FACE_COLORS.L : PLASTIC, x === -1),
        mk(y === 1 ? FACE_COLORS.U : PLASTIC, y === 1),
        mk(y === -1 ? FACE_COLORS.D : PLASTIC, y === -1),
        mk(z === 1 ? FACE_COLORS.F : PLASTIC, z === 1),
        mk(z === -1 ? FACE_COLORS.B : PLASTIC, z === -1),
      ];
    }

    // A rounded "sticker" quad, slightly proud of each colored face, gives the
    // real beveled-tile look without changing the box's face materials (which
    // remain the source of truth for solve detection).
    const stickerGeo = new THREE.PlaneGeometry(CUBIE * 0.82, CUBIE * 0.82);
    function addSticker(mesh: THREE.Mesh, hex: string, normal: THREE.Vector3) {
      const s = new THREE.Mesh(
        stickerGeo,
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(hex),
          roughness: 0.3,
          metalness: 0.02,
          emissive: new THREE.Color(hex),
          emissiveIntensity: 0.2,
        })
      );
      s.position.copy(normal).multiplyScalar(CUBIE / 2 + 0.006);
      s.lookAt(normal.clone().multiplyScalar(2));
      s.raycast = () => {}; // stickers are decorative; raycast hits the box
      mesh.add(s);
    }

    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) {
          const mesh = new THREE.Mesh(rounded, stickerMaterials(x, y, z));
          mesh.position.set(x * STEP, y * STEP, z * STEP);
          // thin dark seams
          const edge = new THREE.LineSegments(
            new THREE.EdgesGeometry(rounded),
            new THREE.LineBasicMaterial({ color: 0x05050a })
          );
          mesh.add(edge);
          if (x === 1) addSticker(mesh, FACE_COLORS.R, new THREE.Vector3(1, 0, 0));
          if (x === -1) addSticker(mesh, FACE_COLORS.L, new THREE.Vector3(-1, 0, 0));
          if (y === 1) addSticker(mesh, FACE_COLORS.U, new THREE.Vector3(0, 1, 0));
          if (y === -1) addSticker(mesh, FACE_COLORS.D, new THREE.Vector3(0, -1, 0));
          if (z === 1) addSticker(mesh, FACE_COLORS.F, new THREE.Vector3(0, 0, 1));
          if (z === -1) addSticker(mesh, FACE_COLORS.B, new THREE.Vector3(0, 0, -1));
          world.add(mesh);
          cubies.push({ mesh });
        }

    const SOLVED_SNAPSHOT = cubies.map((c) => ({
      pos: c.mesh.position.clone(),
      quat: c.mesh.quaternion.clone(),
    }));

    // ---- Resize --------------------------------------------------------
    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    // ---- Turn engine ---------------------------------------------------
    let animating = false;
    let moveCount = 0;
    let solvedFired = false;
    const queue: { axis: Axis; layer: number; dir: 1 | -1; count: boolean }[] = [];

    function cubiesInLayer(axis: Axis, layer: number) {
      return cubies.filter((c) => almost(c.mesh.position[axis], layer * STEP));
    }

    function runTurn(
      axis: Axis,
      layer: number,
      dir: 1 | -1,
      count: boolean,
      ms: number,
      done: () => void
    ) {
      animating = true;
      const group = new THREE.Group();
      world.add(group);
      const members = cubiesInLayer(axis, layer);
      members.forEach((c) => group.attach(c.mesh));
      const target = (Math.PI / 2) * dir;
      const start = performance.now();

      const tick = () => {
        const t = Math.min(1, (performance.now() - start) / ms);
        const e = 1 - Math.pow(1 - t, 3);
        group.rotation[axis] = target * e;
        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          group.rotation[axis] = target;
          group.updateMatrixWorld(true);
          // bake back into world, snapping positions to the lattice
          [...members].forEach((c) => {
            world.attach(c.mesh);
            c.mesh.position.set(
              Math.round(c.mesh.position.x / STEP) * STEP,
              Math.round(c.mesh.position.y / STEP) * STEP,
              Math.round(c.mesh.position.z / STEP) * STEP
            );
          });
          world.remove(group);
          if (count) {
            moveCount += 1;
            onMove?.(moveCount);
            checkSolved();
          }
          animating = false;
          done();
        }
      };
      requestAnimationFrame(tick);
    }

    function pump() {
      if (animating || queue.length === 0) return;
      const job = queue.shift()!;
      runTurn(job.axis, job.layer, job.dir, job.count, job.count ? 200 : 80, pump);
    }

    function enqueue(axis: Axis, layer: number, dir: 1 | -1, count: boolean) {
      queue.push({ axis, layer, dir, count });
      pump();
    }

    function isSolved() {
      // Solved when every face shows a single color. Check by sampling each
      // cubie's world-facing sticker per face direction.
      const dirs: [Axis, number][] = [
        ["x", 1],
        ["x", -1],
        ["y", 1],
        ["y", -1],
        ["z", 1],
        ["z", -1],
      ];
      const axisIndex = { x: 0, y: 1, z: 2 } as const;
      for (const [axis, sign] of dirs) {
        const faceCubies = cubies.filter((c) =>
          almost(c.mesh.position[axis], sign * STEP)
        );
        let color: number | null = null;
        for (const c of faceCubies) {
          // world normal for this face
          const n = new THREE.Vector3();
          n[axis] = sign;
          // find which local face of the cubie points along n
          const localN = n.clone().applyQuaternion(c.mesh.quaternion.clone().invert());
          const idx = dominantFaceIndex(localN);
          const mat = (c.mesh.material as THREE.MeshStandardMaterial[])[idx];
          const hex = mat.color.getHex();
          if (hex === new THREE.Color(PLASTIC).getHex()) return false;
          if (color === null) color = hex;
          else if (color !== hex) return false;
        }
        void axisIndex;
      }
      return true;
    }

    function dominantFaceIndex(local: THREE.Vector3) {
      const ax = Math.abs(local.x);
      const ay = Math.abs(local.y);
      const az = Math.abs(local.z);
      if (ax >= ay && ax >= az) return local.x > 0 ? 0 : 1;
      if (ay >= ax && ay >= az) return local.y > 0 ? 2 : 3;
      return local.z > 0 ? 4 : 5;
    }

    function checkSolved() {
      if (solvedFired) return;
      if (isSolved()) {
        solvedFired = true;
        onSolved?.();
      }
    }

    // ---- Pointer interaction ------------------------------------------
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let mode: "idle" | "orbit" | "twist" = "idle";
    let downX = 0;
    let downY = 0;
    let pick: {
      cubie: THREE.Mesh;
      normal: THREE.Vector3; // world face normal
      point: THREE.Vector3;
    } | null = null;
    let orbitLast = { x: 0, y: 0 };
    const orbitVel = { x: 0, y: 0 };

    function setNdc(e: PointerEvent) {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1
      );
    }

    function pickFace(e: PointerEvent) {
      setNdc(e);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(
        cubies.map((c) => c.mesh),
        false
      );
      if (!hits.length) return null;
      const hit = hits[0];
      const worldNormal = hit.face!.normal
        .clone()
        .transformDirection(hit.object.matrixWorld)
        .round();
      return {
        cubie: hit.object as THREE.Mesh,
        normal: worldNormal,
        point: hit.point.clone(),
      };
    }

    const onPointerDown = (e: PointerEvent) => {
      if (animating) return;
      renderer.domElement.setPointerCapture(e.pointerId);
      downX = e.clientX;
      downY = e.clientY;
      orbitLast = { x: e.clientX, y: e.clientY };
      orbitVel.x = 0;
      orbitVel.y = 0;
      pick = pickFace(e);
      mode = pick ? "twist" : "orbit";
      renderer.domElement.style.cursor = "grabbing";
    };

    const onPointerMove = (e: PointerEvent) => {
      if (mode === "idle") return;
      const dx = e.clientX - downX;
      const dy = e.clientY - downY;

      if (mode === "orbit") {
        const mx = e.clientX - orbitLast.x;
        const my = e.clientY - orbitLast.y;
        orbitLast = { x: e.clientX, y: e.clientY };
        world.rotation.y += mx * 0.011;
        world.rotation.x += my * 0.011;
        world.rotation.x = Math.max(-1.35, Math.min(1.35, world.rotation.x));
        orbitVel.x = my * 0.011;
        orbitVel.y = mx * 0.011;
        return;
      }

      // twist: wait until the drag is decisive, then commit one quarter turn.
      // A low threshold keeps turning easy (the user's priority).
      if (!pick) return;
      if (Math.hypot(dx, dy) < 11) return;

      const commit = decideTwist(pick, dx, dy);
      pick = null; // one twist per gesture
      mode = "idle";
      if (commit) enqueue(commit.axis, commit.layer, commit.dir, true);
    };

    const endPointer = (e: PointerEvent) => {
      try {
        renderer.domElement.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      mode = "idle";
      pick = null;
      renderer.domElement.style.cursor = "grab";
    };

    // Given the picked face and the screen drag, decide which layer to turn
    // and in which direction. Uses the two in-face world axes projected to screen.
    function decideTwist(
      p: { cubie: THREE.Mesh; normal: THREE.Vector3 },
      dx: number,
      dy: number
    ): { axis: Axis; layer: number; dir: 1 | -1 } | null {
      const n = p.normal.clone().normalize();
      // the two axes tangent to the face
      const worldAxes: THREE.Vector3[] = [
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, 0, 1),
      ];
      const tangents = worldAxes.filter(
        (a) => Math.abs(a.dot(n)) < 0.5
      );
      // project each tangent to screen space, compare with drag vector
      const dragScreen = new THREE.Vector2(dx, -dy); // screen y is down
      let best: { axis: THREE.Vector3; score: number } | null = null;
      for (const t of tangents) {
        const screen = worldDirToScreen(t);
        const score = screen.dot(dragScreen.clone().normalize());
        if (!best || Math.abs(score) > Math.abs(best.score))
          best = { axis: t, score };
      }
      if (!best) return null;

      // The rotation axis is normal × dragTangent → the third axis.
      const dragAxis = best.axis.clone().multiplyScalar(Math.sign(best.score));
      const rotAxis = new THREE.Vector3().crossVectors(n, dragAxis).round();
      const axisName: Axis =
        Math.abs(rotAxis.x) > 0.5 ? "x" : Math.abs(rotAxis.y) > 0.5 ? "y" : "z";
      const sign = rotAxis[axisName];
      // which layer: the picked cubie's coordinate on that axis
      const coord = p.cubie.position[axisName];
      const layer = Math.round(coord / STEP);
      const dir: 1 | -1 = sign > 0 ? 1 : -1;
      return { axis: axisName, layer, dir };
    }

    function worldDirToScreen(dir: THREE.Vector3) {
      const origin = new THREE.Vector3(0, 0, 0).project(camera);
      const tip = dir
        .clone()
        .applyEuler(world.rotation)
        .add(new THREE.Vector3())
        .project(camera);
      return new THREE.Vector2(tip.x - origin.x, tip.y - origin.y).normalize();
    }

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", endPointer);
    renderer.domElement.addEventListener("pointercancel", endPointer);

    // ---- Public actions ------------------------------------------------
    function doReset() {
      queue.length = 0;
      cubies.forEach((c, i) => {
        c.mesh.position.copy(SOLVED_SNAPSHOT[i].pos);
        c.mesh.quaternion.copy(SOLVED_SNAPSHOT[i].quat);
      });
      moveCount = 0;
      solvedFired = false;
      onMove?.(0);
    }

    function doScramble() {
      doReset();
      const axes: Axis[] = ["x", "y", "z"];
      const layers = [-1, 0, 1];
      let prevAxis: Axis | null = null;
      for (let i = 0; i < 25; i++) {
        let axis = axes[Math.floor(Math.random() * 3)];
        while (axis === prevAxis) axis = axes[Math.floor(Math.random() * 3)];
        prevAxis = axis;
        const layer = layers[Math.floor(Math.random() * 3)];
        const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
        enqueue(axis, layer, dir, false); // count:false → scramble isn't scored
      }
      // reset counters AFTER the scramble finishes
      const waitDone = () => {
        if (animating || queue.length) {
          requestAnimationFrame(waitDone);
          return;
        }
        moveCount = 0;
        solvedFired = false;
        onMove?.(0);
      };
      requestAnimationFrame(waitDone);
    }

    // Button/keyboard turn: a named face turn, always counted as a move.
    function doTurn(face: CubeFace, prime: boolean) {
      const f = FACE_TURN[face];
      const dir: 1 | -1 = (prime ? -f.cw : f.cw) as 1 | -1;
      enqueue(f.axis, f.layer, dir, true);
    }

    apiRef.current = { scramble: doScramble, reset: doReset, turn: doTurn };

    // ---- Render loop ---------------------------------------------------
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      // Orbit inertia — glide after release, then settle.
      if (mode !== "orbit" && (Math.abs(orbitVel.x) > 1e-4 || Math.abs(orbitVel.y) > 1e-4)) {
        world.rotation.y += orbitVel.y;
        world.rotation.x += orbitVel.x;
        world.rotation.x = Math.max(-1.35, Math.min(1.35, world.rotation.x));
        orbitVel.x *= 0.92;
        orbitVel.y *= 0.92;
      }
      renderer.render(scene, camera);
    };
    loop();
    onReady?.();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", endPointer);
      renderer.domElement.removeEventListener("pointercancel", endPointer);
      renderer.dispose();
      rounded.dispose();
      stickerGeo.dispose();
      if (renderer.domElement.parentNode === mount)
        mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={mountRef} className="rubik-canvas" />;
}
