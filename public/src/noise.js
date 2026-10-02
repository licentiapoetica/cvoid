// Seeded randomness and simplex noise for placing geometry on the CPU.

export function hashCoords(x, y, z) {
  let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRAD = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1],
  [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];
const F3 = 1 / 3, G3 = 1 / 6;

// 3D simplex noise in about -1..1 (after Stefan Gustavson).
export function makeSimplex(seed) {
  const rnd = mulberry32(seed);
  const p = Uint8Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = Uint8Array.from({ length: 512 }, (_, i) => p[i & 255]);

  const corner = (gi, x, y, z) => {
    let t = 0.6 - x * x - y * y - z * z;
    if (t < 0) return 0;
    t *= t;
    const g = GRAD[gi % 12];
    return t * t * (g[0] * x + g[1] * y + g[2] * z);
  };

  return (x, y, z) => {
    const s = (x + y + z) * F3;
    const i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s);
    const t = (i + j + k) * G3;
    const x0 = x - (i - t), y0 = y - (j - t), z0 = z - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 1, 0];
      else if (x0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 0, 1];
      else [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 1, 0, 1];
    } else {
      if (y0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 0, 1, 1];
      else if (x0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 0, 1, 1];
      else [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 1, 1, 0];
    }
    const ii = i & 255, jj = j & 255, kk = k & 255;
    return 32 * (
      corner(perm[ii + perm[jj + perm[kk]]], x0, y0, z0) +
      corner(perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]], x0 - i1 + G3, y0 - j1 + G3, z0 - k1 + G3) +
      corner(perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]], x0 - i2 + 2 * G3, y0 - j2 + 2 * G3, z0 - k2 + 2 * G3) +
      corner(perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]], x0 - 1 + 3 * G3, y0 - 1 + 3 * G3, z0 - 1 + 3 * G3)
    );
  };
}

// A sector's noise recipe as a function of position (in sector widths) returning 0..1.
export function makeField(seed, { frequency, octaves, lacunarity, gain, warp, ridge }) {
  const simplex = makeSimplex(seed);
  return (x, y, z) => {
    x *= frequency; y *= frequency; z *= frequency;
    if (warp > 0) {
      const wx = simplex(x * 0.5 + 31.4, y * 0.5, z * 0.5);
      const wy = simplex(x * 0.5, y * 0.5 + 47.2, z * 0.5);
      const wz = simplex(x * 0.5, y * 0.5, z * 0.5 + 12.9);
      x += wx * warp; y += wy * warp; z += wz * warp;
    }
    let amp = 1, sum = 0, total = 0;
    for (let o = 0; o < octaves; o++) {
      const n = simplex(x, y, z);
      const soft = n * 0.5 + 0.5;
      const sharp = (1 - Math.abs(n)) ** 2;
      sum += amp * (soft + (sharp - soft) * ridge);
      total += amp;
      amp *= gain;
      x *= lacunarity; y *= lacunarity; z *= lacunarity;
    }
    return sum / total;
  };
}
