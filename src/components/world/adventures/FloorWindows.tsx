"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { FLOOR, floorMask } from "../floors";

// Shared canvases bridge the city and the separate, lazy adventure renderer.
// They are created on demand, so importing this module is safe during SSR.
let canvases: HTMLCanvasElement[] | undefined;
export const PORTAL_FEEDS = {
  revision: 0,
  get canvases() {
    return canvases ??= [0, 1, 2].map(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 192;
      return canvas;
    });
  },
};

/** Actual floor views, refreshed twice a second only while the windows are open. */
export default function FloorWindows() {
  const next = useRef(0);
  const resources = useMemo(() => {
    const cameras = [FLOOR.surface, FLOOR.undercity, FLOOR.speedway].map((floor, i) => {
      // A top-down clipping slab excludes the floors above this one without
      // changing shared materials, lights or the main camera's visibility.
      const camera = new THREE.OrthographicCamera(-12.8, 12.8, 9.6, -9.6, 11.5, 15.6);
      camera.position.set(0, 15 - i * 3.6, 0);
      camera.up.set(0, 0, -1);
      camera.lookAt(0, -i * 3.6, 0);
      camera.layers.mask = floorMask(floor);
      return camera;
    });
    const target = new THREE.WebGLRenderTarget(256, 192);
    target.texture.colorSpace = THREE.SRGBColorSpace;
    const pixels = new Uint8Array(256 * 192 * 4);
    return { cameras, target, pixels };
  }, []);
  useEffect(() => () => resources.target.dispose(), [resources]);
  useFrame(({ gl, scene, clock }) => {
    if (clock.elapsedTime < next.current) return;
    next.current = clock.elapsedTime + .5;
    const previous = gl.getRenderTarget();
    const previousXr = gl.xr.enabled;
    const previousAuto = gl.shadowMap.autoUpdate;
    gl.xr.enabled = false;
    gl.shadowMap.autoUpdate = false;
    try {
      resources.cameras.forEach((camera, i) => {
        gl.setRenderTarget(resources.target);
        gl.render(scene, camera);
        gl.readRenderTargetPixels(resources.target, 0, 0, 256, 192, resources.pixels);
        const context = PORTAL_FEEDS.canvases[i].getContext("2d");
        if (!context) return;
        const frame = context.createImageData(256, 192);
        // WebGL and the canvas have opposite vertical origins.
        for (let y = 0; y < 192; y++) {
          frame.data.set(resources.pixels.subarray((191 - y) * 1024, (192 - y) * 1024), y * 1024);
        }
        context.putImageData(frame, 0, 0);
      });
      PORTAL_FEEDS.revision++;
    } finally {
      gl.setRenderTarget(previous);
      gl.xr.enabled = previousXr;
      gl.shadowMap.autoUpdate = previousAuto;
    }
  });
  return null;
}
