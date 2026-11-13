type Runtime = typeof import("@dimforge/rapier3d-compat");
let pending: Promise<Runtime> | undefined;

/** Rapier's WASM module is shared: reinitializing it invalidates existing worlds. */
export function loadPhysics(): Promise<Runtime> {
  return pending ??= import("@dimforge/rapier3d-compat").then(async runtime => {
    await runtime.init();
    return runtime;
  }).catch(error => {
    pending = undefined;
    throw error;
  });
}
