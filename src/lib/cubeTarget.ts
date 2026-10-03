/** Map screen-pixel delta from viewport center to world offset at camera depth. */
export function screenDeltaToWorld(
  dx: number,
  dy: number,
  camZ: number,
  fovDeg: number,
  viewportW: number,
  viewportH: number
) {
  const aspect = viewportW / viewportH;
  const vFov = (fovDeg * Math.PI) / 180;
  const h = 2 * Math.tan(vFov / 2) * camZ;
  const w = h * aspect;
  return {
    x: (dx / viewportW) * w,
    y: -(dy / viewportH) * h,
  };
}

export function measureCubeStageOffset(
  camZ: number,
  fovDeg: number,
  selector = ".cube-stage"
) {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  const stage = document.querySelector(selector);
  if (!stage) return { x: 0, y: 0 };
  const rect = stage.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = cx - window.innerWidth / 2;
  const dy = cy - window.innerHeight / 2;
  return screenDeltaToWorld(
    dx,
    dy,
    camZ,
    fovDeg,
    window.innerWidth,
    window.innerHeight
  );
}
