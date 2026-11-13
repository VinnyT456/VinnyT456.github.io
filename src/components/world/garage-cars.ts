/** The lower-city garage's three small cars and their shared display positions. */
export const GARAGE_POSITION: [number, number] = [-8.8, 7.5];
export const GARAGE_CARS = [
  { name: "Violet", body: "#7c3aed", trim: "#c4b5fd", len: 0.46, wid: 0.22 },
  { name: "Sky", body: "#0284c7", trim: "#67e8f9", len: 0.51, wid: 0.23 },
  { name: "Coral", body: "#e11d69", trim: "#fde7b0", len: 0.42, wid: 0.25 },
] as const;
export const GARAGE_SHOWROOM = [-0.9, 0, 0.9].map((x) => ({ x: GARAGE_POSITION[0] + x, z: GARAGE_POSITION[1] + 0.57 }));
