"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { SPEED } from "../Speedway";
import { saveAdventure, type ReplayFrame, type ReplayMarker } from "./adventure-state";

/** Sample the visible car pose, including collisions and flips, at 10 Hz. */
export default function ReplayRecorder() {
  const recording = useRef({ frames: [] as ReplayFrame[], markers: [] as ReplayMarker[], start: 0, next: 0, revision: -1, eventSequence: 0, active: false });
  const save = () => {
    const rec = recording.current;
    const now = performance.now();
    if (rec.active && rec.eventSequence !== SPEED.replayEvent.sequence && rec.markers.length < 64) {
      const time = Math.max(rec.markers.at(-1)?.time ?? -1, now - rec.start);
      rec.markers.push({ time: Math.min(time, 3600000), kind: SPEED.replayEvent.kind });
      rec.eventSequence = SPEED.replayEvent.sequence;
    }
    if (rec.active && rec.frames.length >= 10) {
      const previousTime = rec.frames.length > 1 ? rec.frames[rec.frames.length - 2][0] : rec.frames.at(-1)?.[0] ?? 0;
      const markerTime = rec.markers.at(-1)?.time ?? 0;
      const time = Math.max(now - rec.start, previousTime + 1, markerTime);
      const pose = SPEED.renderPose;
      const finalFrame: ReplayFrame = [time, pose[0] * .4, pose[1] * .4, pose[2] * .4, pose[3], pose[4], pose[5], pose[6]];
      if (rec.frames.length < 2400) rec.frames.push(finalFrame);
      else rec.frames[rec.frames.length - 1] = finalFrame;
    }
    if (rec.frames.length >= 10) saveAdventure({ replay: rec.frames, replayMarkers: rec.markers });
    rec.active = false;
  };
  useEffect(() => () => {
    save();
  }, []);
  useFrame(() => {
    const rec = recording.current;
    const active = SPEED.on && ["free", "race", "trial"].includes(SPEED.mode);
    if ((!active || rec.revision !== SPEED.revision) && rec.active) {
      save();
      rec.frames = [];
      rec.markers = [];
    }
    if (!active) return;
    const now = performance.now();
    if (!rec.active) {
      rec.start = now;
      rec.next = now;
      rec.revision = SPEED.revision;
      rec.eventSequence = SPEED.replayEvent.sequence;
      rec.markers = [];
      rec.active = true;
    }
    if (rec.eventSequence !== SPEED.replayEvent.sequence && rec.markers.length < 64) {
      const time = Math.max(rec.markers.at(-1)?.time ?? -1, now - rec.start);
      rec.markers.push({ time: Math.min(time, 3600000), kind: SPEED.replayEvent.kind });
      rec.eventSequence = SPEED.replayEvent.sequence;
    }
    if (now < rec.next || rec.frames.length >= 2400) return;
    rec.next = now + 100;
    const p = SPEED.renderPose;
    // The cinema is a tabletop copy of the real circuit (same scale as TRACK).
    rec.frames.push([now - rec.start, p[0] * .4, p[1] * .4, p[2] * .4, p[3], p[4], p[5], p[6]]);
  });
  return null;
}
