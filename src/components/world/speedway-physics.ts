import * as THREE from "three";
import type * as Rapier from "@dimforge/rapier3d-compat";
import { loadPhysics } from "./physics-runtime";
import { SAMPLES, TRACK, TRACK_W, lateral, nearestSample, trackPoint, trackSurfaceHeight } from "./speedway-track";

type RapierModule = typeof import("@dimforge/rapier3d-compat");
export type PhysicsCar = { x: number; y: number; z: number; heading: number; speed: number; i: number };
export type PhysicsRival = PhysicsCar & { lane: number; done: boolean };
type PhysicsInput = { x: number; z: number; run?: boolean };

const STEP = 1 / 60;
const HALF_HEIGHT = 0.145;
const TOP = 3.1;
const RIVAL_SKILL = [0.95, 0.9, 0.86];
const angleTo = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** The physics mesh uses the same flat surface as the visible track. */
function trackMesh(side = 0) {
  const vertices: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    if (side === 0) {
      vertices.push(...trackPoint(i, TRACK_W / 2), ...trackPoint(i, -TRACK_W / 2));
    } else {
      const [x, y, z] = trackPoint(i, side * (TRACK_W / 2 + 0.16));
      vertices.push(x, y, z, x, y + 0.25, z);
    }
    const next = (i + 1) % SAMPLES;
    const a = i * 2;
    const b = next * 2;
    indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  return [new Float32Array(vertices), new Uint32Array(indices)] as const;
}

/** Rapier owns the race cars' movement, contact response and rotation. */
export class SpeedwayPhysics {
  private readonly world: Rapier.World;
  private readonly events: Rapier.EventQueue;
  private readonly bodies: Rapier.RigidBody[] = [];
  private readonly handles = new Map<number, number>();
  private readonly barriers = new Set<number>();
  private readonly enabled = [true, true, true, true];
  private readonly unsettled = [0, 0, 0, 0];
  private readonly stuck = [0, 0, 0, 0];
  private accumulator = 0;
  private revision = -1;

  constructor(R: RapierModule) {
    this.world = new R.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = STEP;
    this.events = new R.EventQueue(true);
    // The deck catches cars that leave the circuit; the track and barriers
    // have their own colliders to keep cars on the circuit.
    this.world.createCollider(R.ColliderDesc.cuboid(11.5, 0.1, 10.75).setTranslation(0, -0.12, 0).setFriction(0.3));
    for (const side of [0, -1, 1]) {
      const [vertices, indices] = trackMesh(side);
      const collider = this.world.createCollider(R.ColliderDesc.trimesh(vertices, indices).setFriction(0.3).setRestitution(0.05));
      if (side !== 0) this.barriers.add(collider.handle);
    }
    for (let i = 0; i < 4; i++) {
      const body = this.world.createRigidBody(R.RigidBodyDesc.dynamic().setCanSleep(false).setCcdEnabled(true).setLinearDamping(0.12).setAngularDamping(0.8));
      const collider = this.world.createCollider(
        R.ColliderDesc.cuboid(0.15, HALF_HEIGHT, 0.25).setMass(1).setFriction(0.2).setRestitution(0.12).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS),
        body
      );
      this.bodies.push(body);
      this.handles.set(collider.handle, i);
    }
  }

  dispose() {
    this.events.free();
    this.world.free();
  }

  private place(index: number, car: PhysicsCar) {
    const body = this.bodies[index];
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), car.heading);
    body.setTranslation({ x: car.x, y: car.y + HALF_HEIGHT + 0.015, z: car.z }, true);
    body.setRotation(q, true);
    body.setLinvel({ x: Math.sin(car.heading) * car.speed, y: 0, z: Math.cos(car.heading) * car.speed }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.unsettled[index] = 0;
    this.stuck[index] = 0;
  }

  reset(revision: number, cars: readonly PhysicsCar[]) {
    this.revision = revision;
    this.accumulator = 0;
    cars.forEach((car, i) => {
      this.bodies[i].setEnabled(true);
      this.enabled[i] = true;
      this.place(i, car);
    });
    this.events.drainCollisionEvents(() => {});
  }

  /** Position the model around its centre of mass, so a flipped car rolls naturally. */
  visual(index: number) {
    const body = this.bodies[index];
    const p = body.translation();
    const q = body.rotation();
    const up = new THREE.Vector3(0, HALF_HEIGHT, 0).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
    return { position: new THREE.Vector3(p.x - up.x, p.y - up.y, p.z - up.z), rotation: new THREE.Quaternion(q.x, q.y, q.z, q.w) };
  }

  step(delta: number, revision: number, player: PhysicsCar & { air: boolean; vy: number; boostUntil: number }, rivals: PhysicsRival[], input: PhysicsInput, mode: "free" | "race" | "trial" | "done", now: number, onPlayerImpact?: () => void) {
    const cars: PhysicsCar[] = [player, ...rivals];
    const recovered = [false, false, false, false];
    if (revision !== this.revision) this.reset(revision, cars);
    const opponents = mode === "race" || mode === "free" || mode === "done";
    for (let i = 1; i < this.bodies.length; i++) {
      if (this.enabled[i] === opponents) continue;
      this.bodies[i].setEnabled(opponents);
      this.enabled[i] = opponents;
    }
    this.accumulator = Math.min(0.1, this.accumulator + Math.max(0, delta));
    while (this.accumulator >= STEP) {
      this.accumulator -= STEP;
      const before = this.bodies.map((body) => ({ p: body.translation(), v: body.linvel() }));
      for (let i = 0; i < this.bodies.length; i++) {
        if (!this.enabled[i]) continue;
        const body = this.bodies[i];
        const car = cars[i];
        const pos = body.translation();
        const q = body.rotation();
        const velocity = body.linvel();
        // Steering and recovery use the same position for this substep.
        const near = nearestSample(pos.x, pos.z, car.i);
        const upright = 1 - 2 * (q.x * q.x + q.z * q.z);
        const fx = 2 * (q.x * q.z + q.w * q.y);
        const fz = 1 - 2 * (q.x * q.x + q.y * q.y);
        const heading = Math.atan2(fx, fz);
        const forwardSpeed = velocity.x * fx + velocity.z * fz;
        let want = 0;
        let turn = 0;
        if (upright > 0.45) {
          if (i === 0) {
            const throttle = mode === "done" ? 0 : input.z;
            const top = now < player.boostUntil ? 4.6 : TOP * (input.run ? 1.18 : 1);
            want = throttle > 0 ? throttle * top : throttle < 0 ? throttle * 1.2 : 0;
            if (now < player.boostUntil && throttle >= 0) want = Math.max(want, 4.6);
            const grip = 0.25 + 0.75 * Math.min(1, Math.abs(forwardSpeed) / 1.2);
            turn = -input.x * 2.3 * grip * (forwardSpeed < -0.03 ? -1 : 1);
          } else if (opponents && !rivals[i - 1].done) {
            const rival = rivals[i - 1];
            const ahead = (near + 22) % SAMPLES;
            const [tx, , tz] = trackPoint(ahead, rival.lane);
            const desired = Math.atan2(tx - pos.x, tz - pos.z);
            turn = THREE.MathUtils.clamp(angleTo(heading, desired) * 3.5, -2.3, 2.3);
            want = TOP * RIVAL_SKILL[i - 1] * (1 - Math.min(0.48, Math.abs(TRACK[ahead].turn) * 1.1));
          }
          const speedGain = Math.min(1, STEP * (want ? 5 : 1.2));
          const sideSpeed = velocity.x * fz - velocity.z * fx;
          const sideGain = Math.min(1, STEP * 5);
          body.applyImpulse({ x: fx * (want - forwardSpeed) * speedGain - fz * sideSpeed * sideGain, y: 0, z: fz * (want - forwardSpeed) * speedGain + fx * sideSpeed * sideGain }, true);
          const spin = body.angvel();
          body.setAngvel({ x: spin.x, y: spin.y + (turn - spin.y) * Math.min(1, STEP * 5), z: spin.z }, true);
        }
        const outside = Math.abs(lateral(near, pos.x, pos.z)) > TRACK_W / 2 + 1.5;
        this.unsettled[i] = upright < 0.2 || outside || pos.y < -0.5 ? this.unsettled[i] + STEP : 0;
        this.stuck[i] = Math.abs(want) > 0.3 && Math.hypot(velocity.x, velocity.z) < 0.12 ? this.stuck[i] + STEP : 0;
        if (this.unsettled[i] > 3 || this.stuck[i] > 1.8) {
          const nearest = nearestSample(pos.x, pos.z);
          // Put a stuck car ahead, but never teleport it across the finish line.
          const closest = this.stuck[i] > 1.8 ? Math.min(SAMPLES - 1, nearest + 25) : nearest;
          recovered[i] = true;
          const offset = i ? rivals[i - 1].lane : THREE.MathUtils.clamp(lateral(closest, pos.x, pos.z), -0.4, 0.4);
          const [x, y, z] = trackPoint(closest, offset);
          const track = TRACK[closest];
          Object.assign(car, { x, y, z, i: closest, speed: 0, heading: Math.atan2(track.tx, track.tz) });
          this.place(i, car);
        }
      }
      this.world.step(this.events);
      this.events.drainCollisionEvents((a, b, started) => {
        if (!started) return;
        const ia = this.handles.get(a);
        const ib = this.handles.get(b);
        const playerBarrier = (ia === 0 && this.barriers.has(b)) || (ib === 0 && this.barriers.has(a));
        if (playerBarrier) {
          const velocity = before[0].v;
          const track = TRACK[player.i];
          const lateralSpeed = Math.abs(velocity.x * track.tz - velocity.z * track.tx);
          if (lateralSpeed > 1.1) onPlayerImpact?.();
          return;
        }
        if (ia === undefined || ib === undefined) return;
        const pa = before[ia].p;
        const pb = before[ib].p;
        const va = before[ia].v;
        const vb = before[ib].v;
        const dx = pb.x - pa.x;
        const dz = pb.z - pa.z;
        const distance = Math.hypot(dx, dz) || 1;
        const closing = ((va.x - vb.x) * dx + (va.z - vb.z) * dz) / distance;
        if (closing < 1.1) return;
        if (ia === 0 || ib === 0) onPlayerImpact?.();
        // A hard offset impact can catch the wheels and tip the struck car.
        const target = Math.hypot(va.x, va.z) >= Math.hypot(vb.x, vb.z) ? ib : ia;
        const force = Math.min(1.2, (closing - 1.1) * 0.65);
        this.bodies[target].applyImpulse({ x: 0, y: Math.min(3, closing * 0.95), z: 0 }, true);
        this.bodies[target].applyTorqueImpulse({ x: (dz / distance) * force, y: 0, z: (-dx / distance) * force }, true);
      });
    }
    cars.forEach((car, i) => {
      if (!this.enabled[i]) return;
      const body = this.bodies[i];
      const p = body.translation();
      const q = body.rotation();
      const v = body.linvel();
      const fx = 2 * (q.x * q.z + q.w * q.y);
      const fz = 1 - 2 * (q.x * q.x + q.y * q.y);
      car.x = p.x;
      car.y = p.y - HALF_HEIGHT;
      car.z = p.z;
      car.heading = Math.atan2(fx, fz);
      car.speed = v.x * fx + v.z * fz;
      const hint = TRACK[car.i];
      car.i = Math.hypot(p.x - hint.x, p.z - hint.z) > 3 ? nearestSample(p.x, p.z) : nearestSample(p.x, p.z, car.i);
      if (i === 0) {
        player.vy = v.y;
        player.air = car.y > trackSurfaceHeight(car.i) + 0.08;
      }
    });
    return recovered;
  }
}

/** Load the physics engine only when the speedway is being used. */
export async function createSpeedwayPhysics() {
  const rapier = await loadPhysics();
  return new SpeedwayPhysics(rapier);
}
