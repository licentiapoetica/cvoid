// How inhabited a region of the grid is. A slow noise over sector coordinates carves the world
// into dense regions, thin ones, and voids several sectors across where nothing was ever placed.
// Shared by the browser and the server so both agree on where the emptiness is.
import { makeSimplex } from "./noise.js";

const noise = makeSimplex(0x76f1d);

export function population(x, y, z) {
  if (Math.hypot(x, y, z) < 1.8) return "dense"; // the hub and its neighbours are always there
  const n = noise(x * 0.11, y * 0.11, z * 0.11) * 0.85 + noise(x * 0.31 + 9.1, y * 0.31, z * 0.31 - 4.3) * 0.15;
  return n < -0.2 ? "void" : n < 0.1 ? "sparse" : "dense";
}
