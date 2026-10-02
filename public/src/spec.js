// Sector specs: the fixed origin hub, the local stand-in generator used when
// Claude can't be reached, and the clamp that every spec passes through.
import { hashCoords, mulberry32 } from "./noise.js";
import { DEFAULT_FIELD } from "./shaders.js";
import { population } from "./population.js";

import { KINDS, PRIMITIVES } from "./structures.js";

const SOLIDS = Object.keys(PRIMITIVES);
const DRIFTS = ["rise", "fall", "orbit", "stream", "still"];
const MODES = ["minor", "dorian", "lydian", "phrygian", "whole", "pentatonic"];

export const ORIGIN = {
  name: "Origin",
  inscription: "Everything saved is kept here, turning.",
  whispers: ["seven lights for seven days", "the hours are cubes", "you were always loading"],
  palette: { fog: "#070d2c", deep: "#02030e", glow: "#5f8cff", accent: "#b9d4ff" },
  fogDensity: 0.3,
  layers: [{ kind: "hub", primitive: "cube", density: 1, scale: 1, order: 1, twist: 0.4, spin: 0.25 }],
  noise: { frequency: 1, octaves: 3, lacunarity: 2, gain: 0.5, warp: 0.3, ridge: 0 },
  motes: { density: 0.5, size: 1, speed: 0.15, drift: "rise" },
  orbs: { count: 7, colors: ["#ff5a5a", "#ffb347", "#f4f06a", "#6ee07a", "#58c8ff", "#6f7bff", "#c77dff"] },
  sound: { root: 55, mode: "lydian", shimmer: 0.5, darkness: 0.45, pulse: 0, tempo: 60 },
  fieldGlsl: `vec3 q = p * 0.6 + vec3(0.0, t * 0.012, 0.0); float n = fbm(q + 0.5 * snoise(q * 0.4)); return smoothstep(0.1, 0.8, n) * 0.9;`,
  source: "origin",
};

const clamp = (v, lo, hi, fallback) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
const hex = (v, fallback) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim() : fallback);
const text = (v, max, fallback) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback);
const pick = (v, options, fallback) => (options.includes(v) ? v : fallback);

const RESERVED_GLSL = /\b(flat|smooth|sample|input|output|filter|common|active|patch|half|centroid|layout)\b(?!\s*\()/g;
// The void is dark. Whatever colour a sector asks for, its fog and shadows are held near black.
function darken(colour, maxLuma) {
  const n = parseInt(colour.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const luma = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  if (luma <= maxLuma) return colour;
  return `#${c.map((ch) => Math.round((ch * maxLuma) / luma).toString(16).padStart(2, "0")).join("")}`;
}

function normalizeLayer(l) {
  const st = l?.stretch ?? {};
  return {
    kind: pick(l?.kind, [...KINDS, "hub"], "none"),
    primitive: pick(l?.primitive, SOLIDS, "cube"),
    density: clamp(l?.density, 0, 1, 0.5),
    scale: clamp(l?.scale, 0.3, 3, 1),
    order: clamp(l?.order, 0, 1, 0.5),
    twist: clamp(l?.twist, 0, 1, 0.2),
    spin: clamp(l?.spin, -1, 1, 0),
    stretch: {
      x: clamp(l?.stretchX ?? st.x, 0.2, 5, 1), y: clamp(l?.stretchY ?? st.y, 0.2, 5, 1), z: clamp(l?.stretchZ ?? st.z, 0.2, 5, 1),
    },
    symmetry: Math.round(clamp(l?.symmetry, 1, 8, 1)),
    tilt: clamp(l?.tilt, 0, 1, 0),
    lift: clamp(l?.lift, -1, 1, 0),
  };
}

const FORBIDDEN_GLSL = /#|\bgl_|\btexture|\buniform\b|\bwhile\b|\bdiscard\b|\bvoid\b|\bstruct\b/;

// Whatever comes back from Claude (or the local generator) is clamped into ranges the renderer can take.
export function normalizeSpec(raw) {
  const s = raw ?? {};
  const n = s.noise ?? {}, m = s.motes ?? {}, o = s.orbs ?? {}, a = s.sound ?? {}, p = s.palette ?? {};
  // sectors dreamt before layers existed carry a single `structure`
  const layers = (Array.isArray(s.layers) && s.layers.length ? s.layers : [s.structure]).slice(0, 3).map(normalizeLayer);
  const glow = hex(p.glow, "#5f8cff");
  const glsl = typeof s.fieldGlsl === "string" && s.fieldGlsl.length <= 1500 && !FORBIDDEN_GLSL.test(s.fieldGlsl)
    ? s.fieldGlsl.replace(RESERVED_GLSL, "$1_") // natural variable names that GLSL ES 3.00 reserves
    : DEFAULT_FIELD;
  const orbCount = Math.round(clamp(o.count, 0, 7, 0));
  return {
    name: text(s.name, 40, "Unnamed"),
    inscription: text(s.inscription, 120, ""),
    whispers: (Array.isArray(s.whispers) ? s.whispers : []).slice(0, 5).map((w) => text(w, 80, "")).filter(Boolean),
    palette: {
      fog: darken(hex(p.fog, "#070d2c"), 0.045), deep: darken(hex(p.deep, "#02030e"), 0.012),
      glow, accent: hex(p.accent, "#b9d4ff"),
    },
    fogDensity: clamp(s.fogDensity, 0, 1, 0.4),
    layers,
    kind: layers.map((l) => (l.primitive === "cube" ? l.kind : `${l.kind} of ${l.primitive}`)).join(" + "),
    hub: layers[0].kind === "hub",
    // something built on purpose: a house, a street, a monument (see buildBlueprint)
    blueprint: typeof s.blueprint === "string" ? s.blueprint.slice(0, 6000) : "",
    dream: clamp(s.dream, 0, 1, 0.3), // how far the built thing sways out of true
    noise: {
      frequency: clamp(n.frequency, 0.3, 6, 1.5),
      octaves: Math.round(clamp(n.octaves, 1, 6, 3)),
      lacunarity: clamp(n.lacunarity, 1.5, 3, 2),
      gain: clamp(n.gain, 0.2, 0.8, 0.5),
      warp: clamp(n.warp, 0, 2, 0.3),
      ridge: clamp(n.ridge, 0, 1, 0),
    },
    motes: {
      density: clamp(m.density, 0, 1, 0.4),
      size: clamp(m.size, 0.3, 3, 1),
      speed: clamp(m.speed, 0, 1, 0.2),
      drift: pick(m.drift, DRIFTS, "rise"),
    },
    orbs: {
      count: orbCount,
      colors: Array.from({ length: orbCount }, (_, i) => hex(o.colors?.[i], glow)),
    },
    sound: {
      root: clamp(a.root, 36, 110, 55),
      mode: pick(a.mode, MODES, "minor"),
      shimmer: clamp(a.shimmer, 0, 1, 0.3),
      darkness: clamp(a.darkness, 0, 1, 0.5),
      pulse: clamp(a.pulse, 0, 1, 0.2),   // how present the slow heartbeat is
      tempo: clamp(a.tempo, 30, 140, 52), // beats per minute
    },
    fieldGlsl: glsl,
    source: s.source ?? "local",
    model: s.model,
    partial: !!s.partial, // geometry has arrived, prose and sky are still being written
  };
}

const hsl = (h, s, l) => {
  h = ((h % 1) + 1) % 1;
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

const NAME_A = ["Quiet", "Drowned", "Glass", "Hollow", "Pale", "Idle", "Second", "Unlit", "Slow", "Folded", "Saved", "Lower", "Far", "Soft", "Blank"];
const NAME_B = ["Archive", "Shelf", "Orchard", "Lattice", "Harbour", "Choir", "Index", "Vestibule", "Garden", "Reservoir", "Stair", "Meridian", "Annex", "Well", "Field"];
const LINES = [
  "nothing here was deleted", "press any direction", "the fog remembers the shape", "a memory card, unreadable",
  "counted, then left alone", "it hums when you look away", "no data", "the hour is approximate",
  "someone arranged these", "deeper is not further", "this was a room once", "the light is on standby",
  "hold still and it turns", "you are the only moving part", "every block is a day",
];
const FIELDS = [
  (r) => `vec3 q = p * ${(0.5 + r() * 0.6).toFixed(2)} + vec3(0.0, t * 0.015, 0.0); float n = fbm(q + 0.6 * snoise(q * 0.5)); return smoothstep(0.05, 0.75, n);`,
  (r) => `float n = ridged(p * ${(0.4 + r() * 0.5).toFixed(2)} + 0.4 * snoise(p * 0.3 + t * 0.01)); return smoothstep(0.45, 0.95, n);`,
  (r) => `float w = worley(p * ${(0.8 + r()).toFixed(2)} + 0.5 * fbm(p * 0.4 + t * 0.01)); return 1.0 - smoothstep(0.0, 0.45, w);`,
  (r) => `float n = fbm(p * 0.45); return pow(0.5 + 0.5 * sin(p.y * ${(2 + r() * 4).toFixed(2)} + n * 6.0 + t * 0.04), 3.0) * 0.8;`,
  (r) => `float d = length(p) * ${(0.5 + r() * 0.8).toFixed(2)}; float n = fbm(p * 0.6 + t * 0.01); return smoothstep(0.75, 1.0, sin(d * 6.0 + n * 3.0)) * 0.8;`,
];

// A few things built on purpose, for the local generator. Claude writes its own.
const BLUEPRINTS = [
  // a house with its lights off
  `cube 0 -40 0 90 50 70
wedge 0 0 0 100 30 76
cube 0 -55 36 14 22 2 !
rep 2 44 0 0 | cube -22 -36 36 14 14 2
cube 30 18 -10 10 26 10
cube 0 -66 0 220 2 200`,
  // a tower block, every window dark but one
  `cube 0 0 0 70 300 50
rep 6 0 44 0 | rep 4 15 0 0 | cube -22 -120 26 9 14 1
cube 8 100 26 9 14 1 !
cube 0 -152 0 200 4 160`,
  // a gate standing alone
  `cyl -60 -20 0 14 220 14
cyl 60 -20 0 14 220 14
cube 0 80 0 190 12 20 0 0 0 !
cube 0 104 0 220 10 24
cube 0 60 0 150 8 14`,
  // a slab, proportions 1 : 4 : 9
  `cube 0 0 0 30 270 120 !`,
  // a ring of standing stones
  `ring 12 150 | cube 0 -40 0 22 120 14
ring 6 150 | cube 0 28 0 14 12 84 90
cube 0 -98 0 60 6 30 !`,
  // a street that goes nowhere
  `cube 0 -80 0 60 2 520
rep 9 0 0 58 | cyl -36 -40 -232 2 80 2
rep 9 0 0 58 | sphere -36 2 -232 7 7 7 !
rep 5 0 0 104 | cube 70 -50 -208 60 60 80
rep 5 0 0 104 | wedge 70 -6 -208 66 28 84 90`,
];

// A sector in a void: nothing was ever placed here. No call to Claude, no geometry, a little dust,
// and thin fog so that whatever is lit on the far side can be seen across it.
export function voidSpec() {
  return {
    name: "void",
    inscription: "",
    whispers: [],
    palette: { fog: "#020307", deep: "#000001", glow: "#39415c", accent: "#59648a" },
    fogDensity: 0.08,
    layers: [{ kind: "none" }],
    noise: {},
    motes: { density: 0.02, size: 0.8, speed: 0.05, drift: "still" },
    orbs: { count: 0 },
    sound: { root: 37, mode: "phrygian", shimmer: 0, darkness: 0.95, pulse: 0.12, tempo: 40 },
    fieldGlsl: "return 0.0;",
    source: "void",
  };
}

// Deterministic stand-in sector for when Claude is unreachable.
export function localSpec(x, y, z) {
  const region = population(x, y, z);
  if (region === "void") return voidSpec();
  const thin = region === "sparse";
  const r = mulberry32(hashCoords(x, y, z));
  const depth = Math.hypot(x, y, z);
  const wander = Math.min(depth / 6, 1);
  const hue = 0.63 + (r() - 0.5) * (0.12 + wander * 0.9);
  const from = (list) => list[Math.floor(r() * list.length)];
  const orbCount = r() < 0.45 ? Math.floor(r() * 6) + 1 : 0;
  return {
    name: `${from(NAME_A)} ${from(NAME_B)}`,
    inscription: from(LINES) + ".",
    whispers: [from(LINES), from(LINES), from(LINES)],
    palette: {
      fog: hsl(hue, 0.55, 0.07 + r() * 0.05),
      deep: hsl(hue + 0.04, 0.6, 0.025),
      glow: hsl(hue + (r() - 0.5) * 0.1, 0.75, 0.62),
      accent: hsl(hue + 0.25 + r() * 0.3, 0.8, 0.7),
    },
    fogDensity: 0.2 + r() * 0.5,
    blueprint: r() < (thin ? 0.08 : 0.35) ? from(BLUEPRINTS) : "",
    dream: r() * r(),
    layers: Array.from({ length: thin || r() < 0.62 ? 1 : r() < 0.8 ? 2 : 3 }, () => ({
      kind: from(KINDS),
      primitive: r() < 0.45 ? "cube" : from(SOLIDS),
      density: (0.08 + r() * r() * 0.7) * (thin ? 0.2 : 1),
      scale: 0.5 + r() * 1.3,
      order: r(),
      twist: r() * 0.8,
      spin: r() < 0.5 ? 0 : (r() - 0.5) * 0.6,
      stretch: r() < 0.6 ? { x: 1, y: 1, z: 1 } : { x: 0.3 + r() * 2.5, y: 0.3 + r() * 3.5, z: 0.3 + r() * 2.5 },
      symmetry: r() < 0.65 ? 1 : 2 + Math.floor(r() * 5),
      tilt: r() < 0.6 ? 0 : r(),
      lift: r() < 0.6 ? 0 : (r() - 0.5) * 1.6,
    })),
    noise: {
      frequency: 0.6 + r() * 3,
      octaves: 2 + Math.floor(r() * 4),
      lacunarity: 1.8 + r() * 0.8,
      gain: 0.35 + r() * 0.3,
      warp: r() * 1.2,
      ridge: r() < 0.4 ? r() : 0,
    },
    motes: { density: (0.05 + r() * 0.4) * (thin ? 0.3 : 1), size: 0.6 + r() * 1.2, speed: r() * 0.5, drift: from(DRIFTS) },
    orbs: { count: orbCount, colors: Array.from({ length: orbCount }, () => hsl(hue + r() * 0.5, 0.8, 0.65)) },
    sound: { root: 40 + r() * 50, mode: from(MODES), shimmer: r() * 0.7, darkness: 0.3 + r() * 0.5, pulse: r() * r() * 0.9, tempo: 40 + r() * 70 },
    fieldGlsl: from(FIELDS)(r),
    source: "local",
  };
}
