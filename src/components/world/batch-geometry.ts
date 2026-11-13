import * as THREE from "three";

/**
 * Pack static mesh geometry directly into an owner's coordinate space.
 * These meshes use ordinary float attributes; return null for anything more
 * exotic so the caller can use Three's general-purpose merge instead.
 */
export function packStaticGeometry(meshes: THREE.Mesh[], inverseOwner: THREE.Matrix4): THREE.BufferGeometry | null {
  if (!meshes.length) return null;
  const names = ["position", "normal", "uv", "phase"] as const;
  const first = meshes[0].geometry;
  const present = names.filter((name) => first.getAttribute(name));
  if (!present.includes("position") || !present.includes("normal") || first.getAttribute("position").itemSize !== 3 || first.getAttribute("normal").itemSize !== 3) return null;
  const sizes = new Map(present.map((name) => [name, first.getAttribute(name).itemSize]));
  const mixedIndices = meshes.some((m) => Boolean(m.geometry.index) !== Boolean(first.index));
  let vertices = 0;
  let indices = 0;
  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    if (Object.keys(geometry.morphAttributes).length) return null;
    const position = geometry.getAttribute("position");
    if (!position) return null;
    for (const name of names) {
      const attribute = geometry.getAttribute(name);
      if (Boolean(attribute) !== sizes.has(name)) return null;
      if (attribute && (attribute.count !== position.count || attribute.itemSize !== sizes.get(name) || attribute.normalized || !(attribute.array instanceof Float32Array) || (attribute as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute)) return null;
    }
    vertices += mixedIndices && geometry.index ? geometry.index.count : position.count;
    if (!mixedIndices && geometry.index) indices += geometry.index.count;
  }
  const arrays = new Map(present.map((name) => [name, new Float32Array(vertices * sizes.get(name)!)]));
  const index = indices ? (vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices)) : null;
  const transform = new THREE.Matrix4();
  const normalTransform = new THREE.Matrix3();
  let vertexOffset = 0;
  let indexOffset = 0;
  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    const position = geometry.getAttribute("position");
    const count = mixedIndices && geometry.index ? geometry.index.count : position.count;
    transform.multiplyMatrices(inverseOwner, mesh.matrixWorld);
    normalTransform.getNormalMatrix(transform);
    const e = transform.elements;
    const ne = normalTransform.elements;
    for (const name of present) {
      const attribute = geometry.getAttribute(name);
      const src = attribute.array as Float32Array;
      const dst = arrays.get(name)!;
      const size = attribute.itemSize;
      for (let i = 0; i < count; i++) {
        const sourceIndex = (mixedIndices && geometry.index ? geometry.index.getX(i) : i) * size;
        const targetIndex = (vertexOffset + i) * size;
        if (name === "position") {
          const x = src[sourceIndex], y = src[sourceIndex + 1], z = src[sourceIndex + 2];
          dst[targetIndex] = e[0] * x + e[4] * y + e[8] * z + e[12];
          dst[targetIndex + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
          dst[targetIndex + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        } else if (name === "normal") {
          const x = src[sourceIndex], y = src[sourceIndex + 1], z = src[sourceIndex + 2];
          const nx = ne[0] * x + ne[3] * y + ne[6] * z;
          const ny = ne[1] * x + ne[4] * y + ne[7] * z;
          const nz = ne[2] * x + ne[5] * y + ne[8] * z;
          const length = Math.hypot(nx, ny, nz) || 1;
          dst[targetIndex] = nx / length;
          dst[targetIndex + 1] = ny / length;
          dst[targetIndex + 2] = nz / length;
        } else {
          for (let component = 0; component < size; component++) dst[targetIndex + component] = src[sourceIndex + component];
        }
      }
    }
    if (index && geometry.index) {
      for (let i = 0; i < geometry.index.count; i++) index[indexOffset++] = geometry.index.getX(i) + vertexOffset;
    }
    vertexOffset += count;
  }
  const merged = new THREE.BufferGeometry();
  for (const name of present) merged.setAttribute(name, new THREE.BufferAttribute(arrays.get(name)!, sizes.get(name)!));
  if (index) merged.setIndex(new THREE.BufferAttribute(index, 1));
  return merged;
}
