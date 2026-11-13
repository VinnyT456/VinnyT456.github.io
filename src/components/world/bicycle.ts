import * as THREE from "three";

/** The bicycle beside the skills garden stays wherever the rider leaves it. */
export const BICYCLE = {
  pos: new THREE.Vector3(6.25, 0, -1.9),
  heading: Math.PI / 2,
  speed: 0,
  riding: false,
};
