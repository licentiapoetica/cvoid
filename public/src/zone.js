// The zone: a dimension reached through a ring of falling blocks, one of the portals round the hub's clock.
// In it hang wells, one for each stage, and the game in them (stack.js) is part of the place: a run
// starts at a well and, stage by stage, is flown on to the next one, the dimension taking that
// stage's look and music, each stage starting faster than the last. Lines you clear burst out of the
// well into the dimension and stay there, drifting with the stage's current; every piece that lands
// sends a shock through them; flying through them knocks them about.
//
// Its stages are looks of ours (palette, sky, current, key, tempo), or whatever the player has put in
// zone/: music, pictures and models of their own, which git ignores (see the README).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { hashCoords, mulberry32 } from "./noise.js";
import { CELL, hubPortal, hubSlot } from "./constants.js";
import { voidHole } from "./hole.js";
import { Stack, W, H, TOP_LEVEL } from "./stack.js";

export const ZONE = "zone";
// the ring in the hub: on the circle of portals round the clock (six places, a sixth of a turn apart),
// straight behind you as you arrive; the plugins take the others: f0ck ahead, then gumo, somafm, and
// past the zone's 4chan and tiktok
// its place on the circle of portals round the clock (see hubSlot): set again once it is known which
// plugins stand there too (see main.js)
const VOID_GATE = new THREE.Vector3(), GATE_AXIS = new THREE.Vector3();
export function placeZoneGate() {
  const at = hubSlot("zone");
  VOID_GATE.set(...at.at);
  GATE_AXIS.set(...at.in);
}
placeZoneGate();
const GATE_R = 130, HOLE = 112;     // the ring of blocks, and the dark that fills it
const CLEAR = HOLE * 4; // how far from its middle you come out of it, either way: well clear of its dark, and of its pull
const EXIT = new THREE.Vector3(0, 0, 800);    // in the zone, the way back out: behind where you arrive
// The wells, one for each stage, along a winding way into the dimension: the first ahead as you
// arrive, each next one further on and off to a side, all facing the way in
const BOARD = new THREE.Vector3(0, 0, -1200); // the first well
const WELL_STEP = 3400;                       // how much further on each next one is
const wellAt = (i, out = new THREE.Vector3()) => out.set(Math.sin(i * 1.3) * 1900, Math.sin(i * 0.8) * 500, BOARD.z - i * WELL_STEP);
const SEAT_AT = new THREE.Vector3(0, 0, 820); // where you sit to play, from its well
// a passage to another well, in seconds: the blocks going (burnt away from the top down, each leaving
// as a streak of light), the flight, and the blocks coming again (from the bottom up, each as its
// streak lands); see setStage
const GO = 0.8, FLY = 2.4, COME = 0.9;
const STREAK = 4; // lights to each block's streak: its head, and those trailing it
const S = 36;                                 // one block, in world units
const STAGE_LINES = 24;                       // lines a stage lasts in a run, unless it says otherwise

const PIECE = { I: "#00e8f0", J: "#2f63ff", L: "#ff9a1a", O: "#ffe21a", S: "#2ee85a", T: "#b54bff", Z: "#ff2f4a" };
const SHAPE = { I: [[0, 0], [1, 0], [2, 0], [3, 0]], J: [[0, 1], [0, 0], [1, 0], [2, 0]], L: [[2, 1], [0, 0], [1, 0], [2, 0]], O: [[0, 0], [1, 0], [0, 1], [1, 1]], S: [[0, 0], [1, 0], [1, 1], [2, 1]], T: [[1, 1], [0, 0], [1, 0], [2, 0]], Z: [[1, 0], [2, 0], [0, 1], [1, 1]] };
const KINDS = Object.keys(PIECE);

// ---- stages ----
// Each is a look: colours, a sky (a field the sky shader draws, as sectors have), the current that
// carries everything loose, and the key and tempo of the music and of the pieces' sounds.
export const STAGES = [
  {
    name: "open water", voice: "drop", palette: { fog: "#03243a", deep: "#00070f", glow: "#2fd5ff", accent: "#c4fff4" },
    sky: "vec3 q = p * 0.5 + vec3(0.0, t * 0.02, 0.0); float n = fbm(q + 0.8 * snoise(q * 0.3 + t * 0.01)); return smoothstep(0.0, 0.7, n) * (0.6 + 0.4 * sin(p.y * 3.0 + t * 0.2));",
    flow: "school", drift: "stream", root: 49, mode: "lydian", bpm: 100,
  },
  {
    name: "ember field", voice: "marimba", palette: { fog: "#2a0b02", deep: "#0a0200", glow: "#ff6a1f", accent: "#ffd27a" },
    sky: "vec3 q = p * 0.9 - vec3(0.0, t * 0.05, 0.0); float n = fbm(q); return pow(smoothstep(0.2, 0.9, n), 2.0) * 1.2;",
    flow: "rise", drift: "rise", root: 55, mode: "dorian", bpm: 118,
  },
  {
    name: "glass desert", voice: "harp", palette: { fog: "#241c10", deep: "#070502", glow: "#ffcf8a", accent: "#9fe7ff" },
    sky: "float b = sin(p.y * 6.0 + fbm(p * 0.6) * 3.0 + t * 0.05); return smoothstep(0.6, 1.0, b) * 0.8;",
    flow: "drift", drift: "stream", root: 46.25, mode: "phrygian", bpm: 92,
  },
  {
    name: "night train", voice: "pluck", palette: { fog: "#0d0a26", deep: "#020108", glow: "#ff3fd0", accent: "#7af7ff" },
    sky: "vec3 q = p * vec3(0.3, 2.0, 0.3) + vec3(t * 0.08, 0.0, 0.0); float n = fbm(q); return smoothstep(0.35, 0.8, n);",
    flow: "spiral", drift: "stream", root: 51.9, mode: "minor", bpm: 128,
  },
  {
    name: "aurora", voice: "chime", palette: { fog: "#04162a", deep: "#01040a", glow: "#3dff9e", accent: "#d38bff" },
    sky: "float c = sin(p.x * 1.5 + fbm(p * 0.4 + t * 0.01) * 4.0 + t * 0.1); return smoothstep(0.5, 1.0, c) * smoothstep(-0.2, 0.6, p.y);",
    flow: "orbit", drift: "orbit", root: 58.3, mode: "pentatonic", bpm: 96,
  },
  {
    name: "deep bloom", voice: "bell", palette: { fog: "#1d0420", deep: "#060008", glow: "#ff4f8b", accent: "#ffe8a3" },
    sky: "vec3 q = p * 1.2; float n = abs(snoise(q + snoise(q * 0.5 + t * 0.02))); return pow(1.0 - n, 6.0);",
    flow: "pulse", drift: "orbit", root: 43.65, mode: "lydian", bpm: 110,
  },
  {
    name: "starfall", voice: "chime", palette: { fog: "#05061a", deep: "#000003", glow: "#8fa8ff", accent: "#ffffff" },
    sky: "float n = snoise(p * 14.0); return smoothstep(0.82, 0.95, n) + fbm(p * 0.5 + t * 0.01) * 0.25;",
    flow: "rain", drift: "fall", root: 61.7, mode: "whole", bpm: 136,
  },
];
// After the last stage, one more well: the deep void, where the void itself plays against you. It is
// only reached by finishing a journey. The kill screen there (every piece on the floor at once, locking
// soon, at the top level), and the void fights back: rows of garbage pushed up from the floor, more and
// sooner as it weakens; every line you clear hurts it (quads and spins more). Clear it out to win.
const DEEP = {
  name: "the deep void", voice: "bell", palette: { fog: "#05000a", deep: "#000000", glow: "#7b3cff", accent: "#e6d9ff" },
  sky: "float n = fbm(p * 0.8 + vec3(0.0, 0.0, t * 0.04)); float v = abs(snoise(p * 2.2 + n * 3.0 - t * 0.05)); return pow(1.0 - v, 8.0) * 0.9 + n * 0.12;",
  flow: "pulse", drift: "fall", root: 36.7, mode: "phrygian", bpm: 150, lines: Infinity, deep: true,
};
const VOID_HP = 100;                            // how much the void can take
const HURT = [0, 4, 10, 18, 30];                // what a clear of 0..4 lines does to it (spins, back-to-backs and combos more)
const TAUNTS = [
  "every line you clear, i keep", "you came all this way to be kept", "i have held everything ever made. i can hold you",
  "faster", "this is where journeys stop", "let go", "you are almost part of me", "fall", "nothing leaves", "again",
];
const DEEP_AWAY = new THREE.Vector3(0, -1400, -5200); // its well: on from the last, further down and further out
const FLOWS = ["school", "rise", "drift", "spiral", "orbit", "pulse", "rain"];
const MODES = ["minor", "dorian", "lydian", "phrygian", "whole", "pentatonic"];
const VOICES = ["bell", "drop", "marimba", "chime", "pluck", "harp"];

let look = STAGES[0]; // the stage the dimension is wearing; its sectors are built from it
const layer = (o) => ({ kind: "none", primitive: "cube", density: 0.5, scale: 1, order: 1, twist: 0, spin: 0, symmetry: 1, tilt: 0, lift: 0, ...o });

// A giant tetromino for a sector's blueprint, turned as one piece.
const euler = new THREE.Euler(), offset = new THREE.Vector3();
function giantPiece(kind, cx, cy, cz, size, rx, ry, rz) {
  euler.set(rx, ry, rz, "YXZ");
  const deg = (a) => ((a * 180) / Math.PI).toFixed(1);
  return SHAPE[kind].map(([x, y]) => {
    offset.set((x - 1) * size, (y - 0.5) * size, 0).applyEuler(euler);
    const at = [cx + offset.x, cy + offset.y, cz + offset.z].map((v) => v.toFixed(1)).join(" ");
    return `cube ${at} ${size * 0.92} ${size * 0.92} ${size * 0.92} ${deg(ry)} ${deg(rx)} ${deg(rz)}`;
  }).join("\n");
}

// A game's stack, played out and left standing: pieces dropped into a well by the game itself,
// as cubes, turned as one. Nothing else stands in the zone.
function frozenStack(r, cx, cy, cz, size, ry) {
  const stack = new Stack(r);
  stack.start();
  for (let n = 10 + Math.floor(r() * 14); n > 0 && stack.state === "playing"; n--) {
    for (let turns = Math.floor(r() * 4); turns > 0; turns--) stack.rotate(1);
    const dir = r() < 0.5 ? -1 : 1;
    for (let steps = Math.floor(r() * 5); steps > 0; steps--) stack.shift(dir);
    stack.hardDrop();
  }
  euler.set(0, ry, 0, "YXZ");
  const lines = [];
  for (let y = 0; y < H && lines.length < 120; y++) for (let x = 0; x < W; x++) {
    if (!stack.rows[y][x]) continue;
    offset.set((x - W / 2 + 0.5) * size, y * size, 0).applyEuler(euler);
    lines.push(`cube ${(cx + offset.x).toFixed(1)} ${(cy + offset.y).toFixed(1)} ${(cz + offset.z).toFixed(1)} ${size * 0.92} ${size * 0.92} ${size * 0.92} ${((ry * 180) / Math.PI).toFixed(1)}`);
  }
  return lines.join("\n");
}

// Sectors of the zone, in the stage's colours: the well in the middle, and out from it nothing but
// tetrominoes, giant ones, in drifts, rings, spirals, lines, and the frozen stacks of games.
export function zoneSpec(x, y, z) {
  const r = mulberry32(hashCoords(x + 31337, y - 4242, z + 777)), s = look;
  const from = (list) => list[Math.floor(r() * list.length)];
  const base = {
    palette: s.palette, fogDensity: 0.1, orbs: { count: 0 }, dream: 0, rainbow: 0, source: "zone", layers: [layer({})], noise: {},
    sound: { root: s.root, mode: s.mode, shimmer: 0.35, darkness: 0.5, pulse: 0, tempo: s.bpm || 100 },
    whispers: [], fieldGlsl: s.sky, motes: { density: 0.35, size: 1.3, speed: 0.3, drift: s.drift }, name: s.name, inscription: "",
  };
  if (x === 0 && y === 0 && z === 0) return { ...base, inscription: "fly to a well · P to play there", blueprint: "" };
  // nothing stands in a sector a well hangs in
  for (let i = 0; i < 16; i++) if (wellAt(i, offset).distanceTo(tmp.set(x, y, z).multiplyScalar(CELL)) < 1500) return { ...base, blueprint: "" };
  const piece = (cx, cy, cz, size, rx, ry, rz) => giantPiece(from(KINDS), cx, cy, cz, size, rx, ry, rz);
  const turn = () => r() * Math.PI * 2;
  const form = from(["drift", "drift", "ring", "spiral", "line", "stack", "stack", "empty"]);
  let parts = [];
  if (form === "drift") {
    // loose pieces, a few large and many small, tumbling where they were left
    for (let n = 4 + Math.floor(r() * 9); n > 0; n--) parts.push(piece((r() - 0.5) * 440, (r() - 0.5) * 360, (r() - 0.5) * 440, 12 + r() ** 2 * 50, turn(), turn(), turn()));
  } else if (form === "ring") {
    const n = 8 + Math.floor(r() * 7), radius = 150 + r() * 110, size = 16 + r() * 14, tilt = (r() - 0.5) * 1.2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      offset.set(Math.cos(a) * radius, 0, Math.sin(a) * radius).applyAxisAngle(AXIS_Z, tilt);
      parts.push(piece(offset.x, offset.y, offset.z, size, tilt, -a, 0));
    }
  } else if (form === "spiral") {
    const n = 12 + Math.floor(r() * 10), size = 13 + r() * 10;
    for (let i = 0; i < n; i++) {
      const a = i * 0.55, radius = 70 + i * 9;
      parts.push(piece(Math.cos(a) * radius, -240 + (i / n) * 480, Math.sin(a) * radius, size, 0, -a, i * 0.3));
    }
  } else if (form === "line") {
    // a run of I pieces end to end, crossing the sector
    const size = 14 + r() * 10, ry = turn(), rz = (r() - 0.5) * 0.8;
    euler.set(0, ry, rz, "YXZ");
    for (let i = -4; i <= 4; i++) {
      offset.set(i * size * 4.2, 0, 0).applyEuler(euler);
      parts.push(giantPiece("I", offset.x, offset.y, offset.z, size, 0, ry, rz));
    }
  } else if (form === "stack") {
    parts.push(frozenStack(r, (r() - 0.5) * 120, -230, (r() - 0.5) * 120, 18 + r() * 8, turn()));
    for (let n = Math.floor(r() * 4); n > 0; n--) parts.push(piece((r() - 0.5) * 420, 80 + r() * 180, (r() - 0.5) * 420, 14 + r() * 16, turn(), turn(), turn()));
  }
  return { ...base, blueprint: parts.join("\n") };
}

// ---- blocks ----
// Every block in here, in the well or adrift, is the same box: lit by its edges, filled faintly.
// The blocks of the game itself can also go and come (DISSOLVE): each burnt away by noise from a
// white-hot edge in its own colour, shrinking and lifting and turning a little as it goes, and put
// together the same way back. aOrder says when, of the whole going (x) and coming (y).
const MINO_VERT = /* glsl */ `
varying vec3 vLocal, vColor;
#ifdef DISSOLVE
attribute vec2 aOrder;
uniform float uP, uForming; // through the going (or, forming, the coming), 0..1
varying float vGone, vSeed;
#endif
void main(){
  vLocal = position;
#ifdef USE_INSTANCING_COLOR
  vColor = instanceColor;
#else
  vColor = vec3(1.);
#endif
  vec3 p = position;
#ifdef DISSOLVE
  float k = clamp((uP - mix(aOrder.x, aOrder.y, uForming) * 0.8) / 0.2, 0., 1.);
  vGone = uForming > 0.5 ? 1. - k : k;
  vSeed = fract(sin(dot(instanceMatrix[3].xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  float g = vGone * vGone, a = g * (vSeed - 0.5) * 2.4;
  p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz;
  p = p * (1. - g * 0.45) + vec3(0., g * 0.9, 0.);
#endif
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.);
}`;
const MINO_FRAG = /* glsl */ `
uniform float uFill, uEdge, uFlash;
varying vec3 vLocal, vColor;
#ifdef DISSOLVE
varying float vGone, vSeed;
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3. - 2. * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
#endif
void main(){
  vec3 d = 0.5 - abs(vLocal);
  float near = d.x + d.y + d.z - max(max(d.x, d.y), d.z); // distance to the nearest edge, on the face
  float edge = 1. - smoothstep(0.035, 0.1, near);
  float face = uFill * (0.45 + 0.55 * smoothstep(0.5, 0.0, near));
  vec3 col = vColor * (face + edge * uEdge) + vColor * uFlash; // steady: they do not pulse with the music
#ifdef DISSOLVE
  if (vGone > 0.) {
    float n = 0.65 * vnoise(vLocal * 4. + vSeed * 31.) + 0.35 * vnoise(vLocal * 9. + vSeed * 17.);
    float cut = vGone * 1.08 - 0.04; // nothing eaten at 0, all of it by 1
    if (n < cut) discard;
    float burn = 1. - smoothstep(0., 0.09, n - cut); // the edge being eaten: white-hot, in its own colour
    col = mix(col, vColor * 2.2 + vec3(0.9), burn) + vColor * vGone * 0.6;
  }
#endif
  gl_FragColor = vec4(col, 1.);
}`;
function minoMaterial(fill, edge, additive = false, dissolve = false) {
  return new THREE.ShaderMaterial({
    vertexShader: MINO_VERT, fragmentShader: MINO_FRAG, defines: dissolve ? { DISSOLVE: "" } : {},
    uniforms: { uFill: { value: fill }, uEdge: { value: edge }, uFlash: { value: 0 }, uP: { value: 0 }, uForming: { value: 0 } },
    transparent: additive, depthWrite: !additive, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false,
  });
}

// The streaks of light the blocks become between one well and the next: each from where its block
// was to where it will be, up and over, eased off and in, wavering as it goes (see makeStreams).
const STREAM_VERT = /* glsl */ `
attribute vec3 aFrom, aMid, aTo, aColor;
attribute vec2 aTime;  // when it leaves and when it arrives, in seconds through the passage
attribute float aTail; // 0 the head of its streak, 1, 2, ... the lights trailing it
uniform float uT;
varying vec3 vColor;
varying float vAlpha;
void main(){
  float k = clamp((uT - aTime.x) / (aTime.y - aTime.x), 0., 1.);
  float e = k * k * k * (k * (k * 6. - 15.) + 10.);
  vec3 p = mix(mix(aFrom, aMid, e), mix(aMid, aTo, e), e);
  float arc = sin(e * 3.14159);
  p += vec3(sin(e * 9. + aTail * 0.6 + aFrom.x * 0.01), cos(e * 7. + aFrom.y * 0.01), sin(e * 8. + aFrom.z * 0.01)) * arc * 30.;
  vColor = aColor;
  vAlpha = step(0.0001, k) * smoothstep(0., 0.06, k) * (1. - smoothstep(0.9, 1., k)) * (1. - aTail * 0.22);
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  gl_PointSize = clamp((14. + 30. * arc) * (1. - aTail * 0.18) * 300. / max(-mv.z, 1.), 1., 64.);
  gl_Position = projectionMatrix * mv;
}`;
const STREAM_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main(){
  float a = pow(max(1. - length(gl_PointCoord - 0.5) * 2., 0.), 1.8) * vAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4((vColor * 1.6 + vec3(0.25)) * a, 1.);
}`;

const SWARM_VERT = /* glsl */ `
attribute float aSeed;
uniform float uSize, uBeat;
varying float vSeed, vFade;
void main(){
  vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(position, 1.);
  float d = length(mv.xyz);
  gl_PointSize = clamp(uSize * (0.6 + aSeed) * (1. + uBeat * 0.7) * 300. / max(d, 1.), 1., 48.);
  vFade = smoothstep(9000., 4000., d) * smoothstep(10., 80., d);
  gl_Position = projectionMatrix * mv;
}`;
const SWARM_FRAG = /* glsl */ `
uniform vec3 uA, uB;
uniform float uUseMap, uLight;
uniform sampler2D uMap;
varying float vSeed, vFade;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float a = pow(max(1. - length(c) * 2., 0.), 1.6);
  vec3 col = mix(uA, uB, vSeed);
  vec4 tex = texture2D(uMap, gl_PointCoord);
  col = mix(col * a, col * tex.rgb * tex.a * 1.6, uUseMap);
  gl_FragColor = vec4(col * vFade * uLight, 1.);
}`;

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), dummy = new THREE.Object3D(), colour = new THREE.Color();
const POS = new THREE.Vector3(), VEL = new THREE.Vector3(), REL = new THREE.Vector3(), ACC = new THREE.Vector3();
const AXIS_Z = new THREE.Vector3(0, 0, 1), NO_TURN = new THREE.Euler();
// the words over the well and the panels beside it: kept just under the bloom's threshold (main.js),
// so they read plainly instead of glowing
const UNLIT = new THREE.Color(0.5, 0.5, 0.5);

// how the stage's current pushes something at r (relative to the well), as an acceleration in out
function current(flow, r, t, seed, beat, out) {
  switch (flow) {
    case "school": {
      // everything streams after a point that wanders round the well, each a little off its line
      const k = seed * 6.28;
      out.set(Math.sin(t * 0.23 + k * 0.1) * 1500 + Math.sin(k) * 160, Math.sin(t * 0.31) * 520 + Math.cos(k * 1.3) * 120, Math.cos(t * 0.19) * 1100 - 500 + Math.cos(k) * 160).sub(r);
      return out.multiplyScalar(Math.min(0.16, 120 / Math.max(out.length(), 1)));
    }
    case "rise": return out.set(Math.sin(r.y * 0.004 + t * 0.3 + seed * 9) * 26, 46, Math.cos(r.x * 0.004 + seed * 7) * 26).addScaledVector(r, -0.004);
    case "rain": return out.set(Math.sin(seed * 40) * 6, -70, 0).addScaledVector(r, -0.002);
    case "orbit": return out.set(-r.z, 0, r.x).normalize().multiplyScalar(85).addScaledVector(r, -0.012).setY(-r.y * 0.01 + Math.sin(t * 0.4 + seed * 12) * 14);
    case "spiral": {
      out.set(-r.y, r.x, 0).normalize().multiplyScalar(95);
      return out.set(out.x - r.x * 0.018, out.y - r.y * 0.018, 34 - r.z * 0.004);
    }
    case "pulse": return out.copy(r).normalize().multiplyScalar(beat * 520 - 34);
    default: return out.set(Math.sin(r.y * 0.003 + t * 0.2 + seed), Math.sin(r.z * 0.003 + t * 0.17), Math.sin(r.x * 0.003 + t * 0.13)).multiplyScalar(36).addScaledVector(r, -0.003);
  }
}

function textCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { canvas, ctx: canvas.getContext("2d"), texture };
}

export class Zone {
  constructor({ scene, world, audio, hintEl, stored, store, arrive, face, levelOut }) {
    Object.assign(this, { scene, world, audio, hintEl, store, arrive, face, levelOut });
    this.best = stored("zone.best", 0);
    this.stages = STAGES.map((s) => ({ ...s, music: [], images: [], models: [] }));
    this.deep = { ...DEEP, music: [], images: [], models: [] }; // the well after the last (see DEEP)
    this.boss = null;     // the void, while it plays against you: { hp, attackIn }
    this.stage = 0;       // the stage the dimension is in, and the well the game is at
    this.watching = null; // a stage whose well shows someone else's game (a plugin's: see the together plugin)
    this.stack = new Stack();
    this.seated = false;
    this.paused = false;  // seated, the run held (Esc): see pause
    this.pull = new THREE.Vector3(); // what the ring adds to the traveller's flight
    this.roll = 0;
    this.fade = 0;
    this.veil = 0;
    this.spent = false;
    this.time = 0;
    this.flash = 0;
    this.kick = new THREE.Vector3(); // the well is knocked by what lands in it, and springs back
    this.kickV = new THREE.Vector3();
    this.callout = { text: "", life: 0, sub: "" };
    this.padDir = 0;
    this.padMap = null;   // the controller's buttons, as mapped (see pad.js), once one has been used
    this.usingPad = false; // the hints name its buttons, not the keys: it was used last
    this.panelIn = 0;

    // ---- the ring: a black hole in a ring of blocks, with the seven pieces turning round it ----
    this.gate = new THREE.Group();
    this.gateMat = minoMaterial(0.35, 0.75);
    const ringCount = 36, orbiting = 7 * 4;
    this.ring = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.gateMat, ringCount + orbiting);
    this.ring.frustumCulled = false;
    for (let i = 0; i < ringCount; i++) {
      const a = (i / ringCount) * Math.PI * 2;
      dummy.position.set(Math.cos(a) * GATE_R, Math.sin(a) * GATE_R, 0);
      dummy.rotation.set(0, 0, a);
      dummy.scale.setScalar(19);
      dummy.updateMatrix();
      this.ring.setMatrixAt(i, dummy.matrix);
      this.ring.setColorAt(i, colour.set(PIECE[KINDS[i % 7]]));
    }
    for (let i = 0; i < orbiting; i++) this.ring.setColorAt(ringCount + i, colour.set(PIECE[KINDS[Math.floor(i / 4)]]));
    this.ringCount = ringCount;
    this.gate.add(this.ring);
    this.hole = new THREE.Mesh(new THREE.SphereGeometry(HOLE, 40, 24), voidHole(world.G.uTime)); // the void's violet in it, glowing at its edge
    this.gate.add(this.hole);
    this.gate.visible = false;
    scene.add(this.gate);

    // ---- everything that only exists inside ----
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    // the wells, each in its stage's colours (see buildWells), and the game: what is in the well it
    // is at, flown from well to well as the stages go by
    this.wells = [];
    this.wellParts = {
      plate: new THREE.PlaneGeometry(W * S, H * S),
      plateMat: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.8, fog: false }),
      grid: (() => {
        const grid = [];
        for (let x = 1; x < W; x++) grid.push((x - W / 2) * S, -H * S / 2, -S * 0.55, (x - W / 2) * S, H * S / 2, -S * 0.55);
        for (let y = 1; y < H; y++) grid.push(-W * S / 2, (y - H / 2) * S, -S * 0.55, W * S / 2, (y - H / 2) * S, -S * 0.55);
        return new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(grid, 3));
      })(),
      bars: [[-W / 2 - 0.15, 0, 0.3, H + 0.6], [W / 2 + 0.15, 0, 0.3, H + 0.6], [0, -H / 2 - 0.15, W + 0.6, 0.3]].map(([x, y, w, h]) => [x, y, new THREE.BoxGeometry(w * S, h * S, S * 0.3)]),
    };
    this.dock = BOARD.clone();     // where the game is: at its well, or on its way to the next
    this.passage = null;           // on the way to another well: see setStage
    this.seatAt = new THREE.Vector3();
    this.board = new THREE.Group();
    this.board.position.copy(BOARD);
    this.group.add(this.board);

    this.boardMat = minoMaterial(0.32, 0.6, false, true);
    const box = new THREE.BoxGeometry(1, 1, 1), capacity = W * (H + 2) + 4 + 4 + 4 * 6;
    this.order = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2); // when each block goes and comes (see drawWell)
    box.setAttribute("aOrder", this.order);
    this.minos = new THREE.InstancedMesh(box, this.boardMat, capacity);
    this.minos.frustumCulled = false;
    this.minos.setColorAt(0, colour.set("#ffffff")); // makes the colour buffer before the first draw
    this.board.add(this.minos);
    this.ghostMat = minoMaterial(0, 0.4, true);
    this.ghost = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.ghostMat, 4);
    this.ghost.frustumCulled = false;
    this.ghost.setColorAt(0, colour.set("#ffffff"));
    this.board.add(this.ghost);
    // the streaks the blocks become on the way to another well
    const streams = new THREE.BufferGeometry(), lights = capacity * STREAK;
    for (const [name, size] of [["position", 3], ["aFrom", 3], ["aMid", 3], ["aTo", 3], ["aColor", 3], ["aTime", 2], ["aTail", 1]]) {
      streams.setAttribute(name, new THREE.BufferAttribute(new Float32Array(lights * size), size));
    }
    streams.setDrawRange(0, 0);
    this.streams = new THREE.Points(streams, new THREE.ShaderMaterial({
      vertexShader: STREAM_VERT, fragmentShader: STREAM_FRAG, uniforms: { uT: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    this.streams.frustumCulled = false;
    this.streams.visible = false;
    this.group.add(this.streams);

    // the panels either side: hold and the numbers on the left, what comes next on the right
    this.left = textCanvas(512, 1024);
    this.right = textCanvas(512, 1024);
    this.panels = [[this.left, -1], [this.right, 1]].map(([panel, side]) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(270, 540), new THREE.MeshBasicMaterial({ map: panel.texture, transparent: true, fog: false, depthWrite: false, color: UNLIT }));
      mesh.position.set(side * (W * S / 2 + 175), 90, -S * 0.5);
      this.board.add(mesh);
      return mesh;
    });
    // the words that come up over the well
    this.word = textCanvas(1024, 256);
    this.wordSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.word.texture, transparent: true, depthWrite: false, depthTest: false, fog: false, color: UNLIT }));
    this.wordSprite.scale.set(760, 190, 1);
    this.wordSprite.position.set(0, 140, 120);
    this.wordSprite.renderOrder = 10;
    this.board.add(this.wordSprite);

    // ---- what is loose in here: blocks thrown out of the well, and the stage's swarm ----
    const N = (this.debrisMax = 1600);
    this.debris = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), minoMaterial(0.4, 0.65), N);
    this.debris.frustumCulled = false;
    this.debris.setColorAt(0, colour.set("#ffffff"));
    this.dPos = new Float32Array(N * 3);
    this.dVel = new Float32Array(N * 3);
    this.dRot = new Float32Array(N * 3);
    this.dSpin = new Float32Array(N * 3);
    this.dLife = new Float32Array(N);
    this.dSize = new Float32Array(N);
    this.dSeed = Float32Array.from({ length: N }, () => Math.random());
    this.dNext = 0;
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    for (let i = 0; i < N; i++) this.debris.setMatrixAt(i, dummy.matrix);
    this.group.add(this.debris);

    const M = 1400, sp = new Float32Array(M * 3), seeds = new Float32Array(M);
    for (let i = 0; i < M; i++) {
      tmp.randomDirection().multiplyScalar(rand(300, 3200)).add(BOARD);
      sp.set([tmp.x, tmp.y, tmp.z], i * 3);
      seeds[i] = Math.random();
    }
    this.sVel = new Float32Array(M * 3);
    this.swarm = new THREE.Points(
      new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(sp, 3)).setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1)),
      new THREE.ShaderMaterial({
        vertexShader: SWARM_VERT, fragmentShader: SWARM_FRAG,
        uniforms: {
          uSize: { value: 9 }, uBeat: { value: 0 }, uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() },
          uUseMap: { value: 0 }, uMap: { value: null }, uLight: { value: 1 },
        },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    );
    this.swarm.frustumCulled = false;
    this.group.add(this.swarm);

    // the player's own pictures and models, for the stage that has them
    this.backdrops = [0, 1].map(() => {
      // far behind the well and wider than the view, its edges fading out, so it reads as sky and not as a picture
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }",
        fragmentShader: `uniform sampler2D uMap; uniform float uOpacity; varying vec2 vUv;
          void main(){ vec2 e = smoothstep(vec2(0.), vec2(0.22), vUv) * smoothstep(vec2(1.), vec2(0.78), vUv); gl_FragColor = vec4(texture2D(uMap, vUv).rgb * e.x * e.y * uOpacity, 1.); }`,
        uniforms: { uMap: { value: null }, uOpacity: { value: 0 } },
        transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
      }));
      mesh.position.set(BOARD.x, BOARD.y, BOARD.z - 9000); // (behind the well the game is at: see update)
      mesh.renderOrder = -1;
      mesh.visible = false;
      this.group.add(mesh);
      return mesh;
    });
    this.backdropAt = 0;
    this.backdropIn = 0;
    this.models = new THREE.Group();
    this.group.add(this.models);
    this.loaded = { key: null, textures: [], images: [] };
    this.textureLoader = new THREE.TextureLoader();
    this.gltf = new GLTFLoader();

    this.buildWells();
    this.applyLook(true);
    this.findStages();
  }

  // A well for each stage, where it hangs (wellAt): its frame and grid in the stage's colours, and the
  // stage's name over it. Made again when the stages change (the player's own, found on the server).
  buildWells() {
    for (const well of this.wells) {
      this.group.remove(well.group);
      well.group.traverse((o) => { if (o.material && o.material !== this.wellParts.plateMat) { o.material.map?.dispose(); o.material.dispose(); } });
    }
    const parts = this.wellParts, n = this.stages.length;
    this.wells = [...this.stages, this.deep].map((s, i) => {
      const group = new THREE.Group(), at = i < n ? wellAt(i) : wellAt(n).add(DEEP_AWAY);
      group.position.copy(at);
      const accent = new THREE.Color(s.palette.accent), glow = new THREE.Color(s.palette.glow);
      const plate = new THREE.Mesh(parts.plate, parts.plateMat);
      plate.position.z = -S * 0.6;
      group.add(plate, new THREE.LineSegments(parts.grid, new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.08, fog: false })));
      const frame = new THREE.MeshBasicMaterial({ color: glow.clone().lerp(accent, 0.3).multiplyScalar(0.5), fog: false });
      for (const [x, y, geometry] of parts.bars) {
        const bar = new THREE.Mesh(geometry, frame);
        bar.position.set(x * S, y * S, 0);
        group.add(bar);
      }
      // its name over it, plainly (under the bloom, as the words over the well are)
      const sign = textCanvas(1024, 192), ctx = sign.ctx;
      ctx.textAlign = "center";
      if ("letterSpacing" in ctx) ctx.letterSpacing = "10px";
      ctx.font = '300 72px "Helvetica Neue", Helvetica, Arial, sans-serif';
      ctx.fillStyle = s.palette.accent;
      ctx.fillText(s.name.toUpperCase(), 512, 84, 1000);
      if ("letterSpacing" in ctx) ctx.letterSpacing = "4px";
      ctx.font = '300 32px "Helvetica Neue", Helvetica, Arial, sans-serif';
      ctx.fillStyle = "#ffffff";
      ctx.fillText(i < n ? `stage ${i + 1} of ${n}` : "the end of every journey", 512, 150, 1000);
      sign.texture.needsUpdate = true;
      const label = new THREE.Mesh(new THREE.PlaneGeometry(640, 120), new THREE.MeshBasicMaterial({ map: sign.texture, transparent: true, depthWrite: false, fog: false, color: UNLIT }));
      label.position.set(0, H * S / 2 + 110, 0);
      group.add(label);
      this.group.add(group);
      return { group, at };
    });
  }

  // ---- stages ----

  // the player's files, if there are any, become the stages
  async findStages() {
    let found;
    try {
      const res = await fetch("/api/zone");
      if (!res.ok) return;
      found = await res.json();
    } catch {
      return;
    }
    if (!found?.stages?.length && !found?.images?.length && !found?.models?.length) return;
    const num = (v, lo, hi) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined);
    const own = (found.stages ?? []).map((s, i) => {
      // a stage takes the sky and the rest it does not set from one of ours: the one it names, or the next in turn
      const c = s.config ?? {}, base = STAGES.find((b) => b.name === c.look) ?? STAGES[i % STAGES.length];
      const palette = { ...base.palette };
      for (const k of Object.keys(palette)) if (typeof c.palette?.[k] === "string" && /^#[0-9a-f]{6}$/i.test(c.palette[k])) palette[k] = c.palette[k];
      return {
        ...base, name: String(c.title ?? s.name).slice(0, 40), palette,
        // the tempo is only known if the player says it: a built-in one would put the pieces off the beat
        bpm: num(c.bpm, 40, 240) ?? (s.music.length ? 0 : base.bpm), offset: num(c.offset, 0, 60) ?? 0,
        root: num(c.root, 20, 500) ?? base.root, mode: MODES.includes(c.mode) ? c.mode : base.mode,
        flow: FLOWS.includes(c.behaviour ?? c.flow) ? (c.behaviour ?? c.flow) : base.flow,
        voice: VOICES.includes(c.voice) ? c.voice : base.voice, lines: num(c.lines, 4, 200) ?? STAGE_LINES,
        sky: typeof c.sky === "string" ? c.sky : base.sky,
        music: s.music, images: [...s.images, ...(found.images ?? [])], models: [...s.models, ...(found.models ?? [])],
      };
    });
    // only pictures or models, no folders: they go with our own stages
    if (!own.length) for (const s of this.stages) Object.assign(s, { images: found.images ?? [], models: found.models ?? [] });
    else this.stages = own;
    this.stage = 0;
    this.buildWells();
    this.applyLook(true);
    this.dock.copy(this.wells[0].at);
    this.passage = null;
  }

  // a stage by its well: the stages, then the deep void
  stageAt(index) {
    return index === this.stages.length ? this.deep : this.stages[index];
  }
  get atDeep() {
    return this.stage === this.stages.length;
  }

  // Put the dimension in the current stage's look, sound and music. Nothing is cut: the colours ease
  // over (here in update, and the world's in World.enter), the sky fades across, the songs crossfade.
  applyLook(instant = false) {
    const s = this.stageAt(this.stage);
    look = s;
    this.look = s;
    this.audio.setZoneStage(s);
    const accent = new THREE.Color(s.palette.accent), glow = new THREE.Color(s.palette.glow);
    // the pieces keep their colours, leaning toward the stage's light
    this.targets = {
      a: glow.clone().multiplyScalar(0.9), b: accent.clone().multiplyScalar(0.7),
      pieces: Object.fromEntries(KINDS.map((k) => [k, new THREE.Color(PIECE[k]).lerp(glow, 0.12)])),
    };
    this.colours ??= { G: new THREE.Color("#4a3d66") }; // (garbage: the void's own grey violet)
    for (const k of KINDS) this.colours[k] ??= this.targets.pieces[k].clone();
    if (instant) this.ease(1);
    this.loadAssets(s);
    if (this.world.realm === ZONE) this.world.restyle();
    this.panelIn = 0;
  }

  // the swarm and the pieces drift toward the stage's colours
  ease(amount) {
    const t = this.targets, u = this.swarm.material.uniforms;
    u.uA.value.lerp(t.a, amount);
    u.uB.value.lerp(t.b, amount);
    for (const k of KINDS) this.colours[k].lerp(t.pieces[k], amount);
  }

  // Another stage, and the game goes over to its well: its blocks burn away, each leaving as a streak
  // of light, the game is flown up and over to the next well (whoever sits at it carried along: see
  // seat) while the dimension turns to the new stage's look and music, and the blocks come together
  // again there as their streaks land. The game waits meanwhile (see moving).
  setStage(index) {
    const count = this.wells.length; // (the stages and the deep void)
    index = ((index % count) + count) % count;
    if (index === this.stage) return;
    this.stage = index;
    // already between wells, its blocks gone: on from where it is, without going again
    const under = this.passage && this.passage.t >= GO;
    const from = this.dock.clone(), to = this.wells[index].at.clone();
    const mid = from.clone().add(to).multiplyScalar(0.5).add(tmp.set(0, 900, 0));
    this.passage = { t: under ? GO : 0, from, to, mid, looked: false, said: null };
    if (under) this.streams.geometry.setDrawRange(0, 0);
    else this.makeStreams();
  }

  get moving() {
    return !!this.passage;
  }

  // a streak for each block as it is drawn now, from its place in this well to its place in the next
  makeStreams() {
    const p = this.passage, a = this.streams.geometry.attributes, m = new THREE.Matrix4(), c = new THREE.Color(), at = new THREE.Vector3();
    let k = 0;
    for (let i = 0; i < this.minos.count; i++) {
      this.minos.getMatrixAt(i, m);
      at.setFromMatrixPosition(m);
      this.minos.getColorAt(i, c);
      // it leaves as its block is half burnt away, and lands as its block is half put together
      const leave = GO * (this.order.getX(i) * 0.8 + 0.1), land = GO + FLY + COME * (this.order.getY(i) * 0.8 + 0.1);
      // each its own way: up and over, and a little to a side
      tmp.copy(p.from).add(p.to).multiplyScalar(0.5).add(at).add(tmp2.set(rand(-500, 500), rand(700, 1300), rand(-300, 300)));
      for (let s = 0; s < STREAK; s++, k++) {
        a.aFrom.setXYZ(k, p.from.x + at.x, p.from.y + at.y, p.from.z + at.z);
        a.aMid.setXYZ(k, tmp.x, tmp.y, tmp.z);
        a.aTo.setXYZ(k, p.to.x + at.x, p.to.y + at.y, p.to.z + at.z);
        a.aColor.setXYZ(k, c.r, c.g, c.b);
        a.aTime.setXY(k, leave + s * 0.035, land + s * 0.035);
        a.aTail.setX(k, s);
      }
    }
    for (const name of ["aFrom", "aMid", "aTo", "aColor", "aTime", "aTail"]) a[name].needsUpdate = true;
    this.streams.geometry.setDrawRange(0, k);
  }

  // the level a stage starts at: the first at 1, the last near the top, so that it ends at the endgame speed
  stageLevel(index) {
    if (index >= this.stages.length) return TOP_LEVEL; // (the deep void)
    return 1 + Math.round((index * (TOP_LEVEL - 3)) / Math.max(1, this.stages.length - 1));
  }

  // the well nearest to a place (the one you are with, unless another is clearly nearer)
  nearestWell(at) {
    let best = this.stage, bestD = this.wells[this.stage] ? this.wells[this.stage].at.distanceTo(at) * 0.85 : Infinity;
    this.wells.forEach((well, i) => {
      const d = well.at.distanceTo(at);
      if (d < bestD) { best = i; bestD = d; }
    });
    return best;
  }

  // how far through its stage a run is, 0..1 (the last stage of a journey with just one stage never ends)
  get progress() {
    const stack = this.stack;
    if (stack.state !== "playing") return 0;
    if (this.boss) return 1 - this.boss.hp / VOID_HP; // (in the deep void: the music opens as the void weakens)
    return Math.min(1, (stack.lines - this.stageFrom) / (this.look.lines ?? STAGE_LINES));
  }

  // a run moves through the stages as the lines add up, from the one it began on to the last
  advance() {
    const stack = this.stack;
    if (stack.state !== "playing" || this.progress < 1 || this.atDeep) return;
    // the last one done: on to the deep void, where the void plays against you
    if (this.stage >= this.stages.length - 1) {
      if (this.stages.length < 2) return; // (one stage alone: it goes on)
      this.setStage(this.stages.length);
      stack.pace(TOP_LEVEL);
      stack.killScreen(true);
      this.boss = { hp: VOID_HP, attackIn: 9 };
      this.audio.zoneSound("journey");
      this.say("", "");
      if (this.passage) this.passage.said = ["the deep void", "you and the void · clear lines to hurt it", 4];
      return;
    }
    this.stageFrom = stack.lines;
    this.setStage(this.stage + 1); // flown on to its well
    stack.pace(this.stageLevel(this.stage));
    this.audio.zoneSound("stage");
    this.say("", "");
    // its name as the blocks come together there
    if (this.passage) this.passage.said = [this.stages[this.stage].name, `stage ${this.stage + 1} of ${this.stages.length} · level ${stack.level}`, 3.4];
  }

  loadAssets(s) {
    const key = `${s.name}|${s.images.join()}|${s.models.join()}`;
    if (this.loaded.key === key) return;
    for (const t of this.loaded.textures) t.dispose();
    this.models.clear();
    this.loaded = { key, textures: [], images: [] };
    for (const b of this.backdrops) {
      b.material.uniforms.uOpacity.value = 0;
      b.visible = false;
    }
    const uniforms = this.swarm.material.uniforms;
    uniforms.uUseMap.value = 0;
    uniforms.uMap.value = null;
    const load = (url) => new Promise((done) => {
      const t = this.textureLoader.load(url, () => done(t), undefined, () => done(null));
      t.colorSpace = THREE.SRGBColorSpace;
      this.loaded.textures.push(t);
    });
    // pictures named like skies or backgrounds hang far behind the well; the first of the rest is what the swarm is made of
    const backdrop = s.images.filter((u) => /sky|back|bg|pano|env|backdrop/i.test(decodeURIComponent(u)));
    const sprite = s.images.find((u) => !backdrop.includes(u));
    Promise.all(backdrop.slice(0, 16).map(load)).then((list) => { if (this.loaded.key === key) this.loaded.images = list.filter(Boolean); });
    if (sprite) load(sprite).then((t) => {
      if (!t || this.loaded.key !== key) return;
      uniforms.uMap.value = t;
      uniforms.uUseMap.value = 1;
    });
    s.models.forEach((url, i) => this.gltf.load(url, (gltf) => {
      if (this.loaded.key !== key) return;
      const model = gltf.scene, box = new THREE.Box3().setFromObject(model), size = box.getSize(tmp).length() || 1;
      model.position.sub(box.getCenter(tmp2));
      const holder = new THREE.Group();
      holder.add(model);
      holder.scale.setScalar(2200 / size);
      // unlit here, as everything in the void is: their own colours and textures, at full strength
      model.traverse((o) => {
        if (!o.isMesh) return;
        const old = [o.material].flat()[0] ?? {};
        o.material = new THREE.MeshBasicMaterial({ map: old.map ?? null, color: old.color ?? 0xffffff, transparent: !!old.transparent, opacity: old.opacity ?? 1, side: THREE.DoubleSide, fog: false });
      });
      const a = s.models.length > 1 ? (i / (s.models.length - 1) - 0.5) * 1.6 : 0;
      holder.position.set(Math.sin(a) * 3600, 250, BOARD.z - Math.cos(a) * 3600);
      holder.userData.spin = (i % 2 ? -1 : 1) * 0.05;
      this.models.add(holder);
    }, undefined, () => {}));
  }

  // ---- the ring ----

  gateAt(realm) {
    if (realm === ZONE) return { centre: EXIT, axis: AXIS_Z };
    if (realm === "void") return { centre: VOID_GATE, axis: GATE_AXIS };
    return null; // marderchen's dimension has no way into this one
  }

  travel(camera) {
    if (window.cvoid?.held?.(true)) return; // (held where you are, a group's member: see main.js)
    const { world } = this, entering = world.realm !== ZONE;
    world.setRealm(entering ? ZONE : "void");
    const { centre, axis } = this.gateAt(world.realm);
    if (entering) {
      // you come out in front of the ring, facing the well
      camera.position.copy(centre).addScaledVector(axis, -CLEAR);
      this.arrive(0, -0.02);
    } else {
      // and leaving, just in front of the ring in the hub, facing out of it into the hub
      camera.position.copy(centre).addScaledVector(axis, CLEAR);
      this.arrive(Math.atan2(-axis.x, -axis.z), 0);
      this.stand();
    }
    this.spent = true;
    this.inHole = false;
    this.veil = 1.3;
    this.audio.sting();
    if (entering) this.audio.setZoneStage(this.look);
    this.audio.setZone(entering);
    this.group.visible = entering;
  }

  updateGate(dt, camera) {
    const at = this.gateAt(this.world.realm);
    this.pull.set(0, 0, 0);
    this.veil = Math.max(0, this.veil - dt / 1.9);
    if (!at) {
      this.gate.visible = false;
      this.fade = Math.min(1, this.veil);
      this.roll *= Math.exp(-dt * 2.5);
      return;
    }
    const { centre, axis } = at;
    this.gate.position.copy(centre);
    this.gate.quaternion.setFromUnitVectors(AXIS_Z, axis);
    const distance = centre.distanceTo(camera.position);
    this.gate.visible = distance < 6000;
    if (this.gate.visible) {
      // the seven pieces turning round the ring, each tumbling
      for (let p = 0; p < 7; p++) {
        const a = this.time * 0.35 + (p / 7) * Math.PI * 2, kind = KINDS[p];
        euler.set(this.time * (0.4 + p * 0.07), this.time * 0.5 + p, 0);
        for (let k = 0; k < 4; k++) {
          const [x, y] = SHAPE[kind][k];
          offset.set((x - 1) * 20, (y - 0.5) * 20, 0).applyEuler(euler);
          dummy.position.set(Math.cos(a) * (GATE_R + 90), Math.sin(a) * (GATE_R + 90), Math.sin(a * 2 + this.time) * 40).add(offset);
          dummy.rotation.copy(euler);
          dummy.scale.setScalar(18);
          dummy.updateMatrix();
          this.ring.setMatrixAt(this.ringCount + p * 4 + k, dummy.matrix);
        }
      }
      this.ring.instanceMatrix.needsUpdate = true;
      this.ring.rotation.z += dt * 0.2;
    }
    // The ring you have just come out of does not draw you: not until you are beyond its reach (and
    // inside, the way out only ever draws gently, from close by). Flying into it on purpose always
    // takes you through. (As the others round the clock do: see the f0ck plugin's updateGate.)
    const inside = this.world.realm === ZONE;
    if (distance > (inside ? 1400 : 1000)) this.spent = false;
    // the pull: a cone either side of the ring, gentle far off, strong at the end, and turning
    offset.copy(camera.position).sub(centre);
    const along = offset.dot(axis);
    tmp.copy(offset).addScaledVector(axis, -along);
    const radial = tmp.length() || 1, wide = GATE_R + Math.abs(along) * 0.55, REACH = inside ? 420 : 900;
    const held = !!window.cvoid?.held?.(); // (a group's member: it neither draws nor darkens, and does not take them)
    let suck = 0;
    if (!this.spent && !held && Math.abs(along) < REACH && radial < wide) {
      suck = (1 - Math.abs(along) / REACH) ** 1.5 * (1 - radial / wide);
      tmp.divideScalar(radial);
      this.pull.copy(tmp).multiplyScalar(-190).addScaledVector(axis, -Math.sign(along) * 260).add(tmp2.crossVectors(axis, tmp).multiplyScalar(70)).multiplyScalar(suck * (inside ? 0.45 : 1));
    }
    this.roll += suck ** 2 * dt * (inside ? 0.6 : 1.6);
    this.roll -= Math.round(this.roll / (Math.PI * 2)) * Math.PI * 2;
    if (!suck) this.roll *= Math.exp(-dt * 2.5);
    // (coming back to the one you came out of, the dark gathers only at its mouth)
    const closing = held ? 0 : 1 - THREE.MathUtils.smoothstep(distance, HOLE * 0.7, this.spent ? HOLE * 1.3 : HOLE * 2.6);
    this.fade = Math.max(closing, Math.min(1, this.veil));
    // through only by flying into it from outside: not by being in it already
    const inHole = distance < HOLE * 0.7, cameIn = inHole && !this.inHole;
    this.inHole = inHole;
    if (cameIn) this.travel(camera);
  }

  // ---- playing ----

  get nearWell() {
    return this.world.realm === ZONE && this.camera && this.camera.position.distanceTo(this.seat) < 1500;
  }

  // where you sit: before the well the game is at, moving with it from well to well
  get seat() {
    return this.seatAt.copy(this.dock).add(SEAT_AT);
  }

  // R (main.js): turn to look straight at the well, from the seat or from wherever you are flying
  lookAtWell() {
    if (this.seated) return this.face(0, 0);
    const d = tmp.copy(this.board.position).sub(this.camera.position);
    this.face(Math.atan2(-d.x, -d.z), Math.atan2(d.y, Math.hypot(d.x, d.z)));
  }

  sit() {
    if (this.seated) return;
    this.seated = true;
    this.arrive(0, 0); // facing the well
    if (this.stack.state === "playing") this.say("", "");
    else this.say(this.look.name, () => `${this.keyFor("start", "space")} to start${this.stages.length > 1 ? ` · ${this.usingPad ? "stick ← →" : "← →"} another well` : ""}`);
  }

  stand() {
    if (!this.seated) return;
    this.seated = false;
    this.paused = false; // (standing up is a pause of its own: P sits you down again where you were)
    for (const action of ["left", "right", "soft"]) this.stack.release(action);
    this.padDir = 0;
    if (this.stack.state === "playing") this.say("paused", () => `${this.keyFor("sit", "p")} to come back`);
  }

  // Esc, or the pointer let go: the run held while you stay seated; Esc again or a click goes on
  pause() {
    if (!this.seated || this.paused || this.stack.state !== "playing") return;
    this.paused = true;
    for (const action of ["left", "right", "soft"]) this.stack.release(action);
    this.padDir = 0;
    this.say("paused", () => (this.usingPad ? `${this.keyFor("start", this.keyFor("sit", "esc"))} to go on` : "esc or click to go on · p to stand up"), 1e9);
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.say("", "");
  }

  // a run, from the well you are at: its stage, at that stage's pace. Not from the deep void: only a whole
  // journey leads there, and from it a new one begins at the first well.
  begin() {
    this.boss = null;
    if (this.atDeep) {
      this.setStage(0);
      return this.say(this.stages[0].name, () => `a journey begins at the first well · ${this.keyFor("start", "space")} to start`, 4);
    }
    this.audio.setZoneStage(this.look, true); // every run starts its song from the beginning
    this.stack.start();
    this.stack.pace(this.stageLevel(this.stage));
    this.stageFrom = 0;
    this.say(this.look.name, `stage ${this.stage + 1} of ${this.stages.length} · level ${this.stack.level}`);
  }

  // the keyboard while sitting at the well; returns whether the key was the game's
  key(e, down) {
    this.usePad(false);
    if (!this.seated) {
      if (down && !e.repeat && e.code === "KeyP" && this.nearWell) return this.sit(), true;
      return false;
    }
    const actions = {
      ArrowLeft: "left", ArrowRight: "right", ArrowDown: "soft", Space: "hard", ArrowUp: "cw", KeyX: "cw",
      KeyZ: "ccw", ControlLeft: "ccw", ControlRight: "ccw", KeyA: "flip", KeyC: "hold", ShiftLeft: "hold", ShiftRight: "hold",
    };
    const action = actions[e.code];
    if (!action && !["KeyP", "Escape", "Enter"].includes(e.code)) return false;
    if (!down) {
      if (action) this.stack.release(action);
      return true;
    }
    if (e.repeat) return true;
    if (e.code === "Escape" && this.stack.state === "playing") return (this.paused ? this.resume() : this.pause()), true;
    if (e.code === "KeyP" || e.code === "Escape") return this.stand(), true;
    if (this.paused || this.moving) return true; // held, or on the way to the next well: the game waits
    if (this.stack.state !== "playing") {
      if (e.code === "Space" || e.code === "Enter") this.begin();
      else if (action === "left" || action === "right") this.chooseStage(action === "left" ? -1 : 1);
      return true;
    }
    if (action) this.stack.press(action);
    return true;
  }

  // before a run, ← →: over to the well before or after, to start there
  chooseStage(step) {
    if (this.stages.length < 2) return;
    // round the stages only: the deep void is not a place to start (from there: to the first or the last)
    const from = this.atDeep ? (step > 0 ? -1 : 0) : this.stage;
    this.setStage((from + step + this.stages.length) % this.stages.length);
    this.say(this.stages[this.stage]?.name ?? "the deep void", () => `stage ${this.stage + 1} of ${this.stages.length} · level ${this.stageLevel(this.stage)} · ${this.keyFor("start", "space")} to start`);
  }

  // a controller at the well, its buttons as the player has mapped them (pad: the PadMap, see pad.js)
  pad(gp, pad) {
    this.padMap = pad;
    if (pad.newly.size) this.usePad(true);
    const hit = (id) => pad.hit(id);
    if (!this.seated) {
      if (hit("sit") && this.nearWell) this.sit();
      return;
    }
    if (this.paused) {
      if (hit("sit") || hit("start")) this.resume();
      return;
    }
    if (hit("sit")) return this.stand();
    if (hit("lookAtWell")) this.levelOut();
    if (this.moving) return; // (on the way to the next well: nothing is played)
    const playing = this.stack.state === "playing";
    // left and right: their buttons, or the moving stick pushed well over
    const x = pad.sticks(gp).move[0], dir = pad.down("left") || x < -0.6 ? -1 : pad.down("right") || x > 0.6 ? 1 : 0;
    if (dir !== this.padDir) {
      if (this.padDir) this.stack.release(this.padDir < 0 ? "left" : "right");
      if (dir && playing) this.stack.press(dir < 0 ? "left" : "right");
      if (dir && !playing) this.chooseStage(dir);
      this.padDir = dir;
    }
    if (!playing) {
      if (hit("start")) this.begin();
      return;
    }
    if (hit("softDrop")) this.stack.press("soft");
    if (pad.released("softDrop")) this.stack.release("soft");
    if (hit("hardDrop")) this.stack.press("hard");
    if (hit("rotate")) this.stack.press("cw");
    if (hit("rotateBack")) this.stack.press("ccw");
    if (hit("flip")) this.stack.press("flip");
    if (hit("hold")) this.stack.press("hold");
  }

  // what to press for an action, on whichever was used last: the controller's button for it (the first,
  // as mapped), or the key
  keyFor(id, key) {
    const [button] = this.usingPad ? this.padMap.buttons(id) : [];
    return button === undefined ? key : this.padMap.name(button);
  }
  // the keyboard used, or the controller: what is said over the well names the one in hand
  usePad(on) {
    if (on === this.usingPad) return;
    this.usingPad = on;
    if (this.callout.life > 0 && typeof this.callout.sub === "function") this.drawCallout();
  }

  // the words over the well (sub: the line under them, or a function making it, when it names what to press)
  say(text, sub = "", seconds = 2.2) {
    this.callout = { text, sub, life: seconds, total: seconds };
    this.drawCallout();
  }
  drawCallout() {
    const { text } = this.callout, sub = typeof this.callout.sub === "function" ? this.callout.sub() : this.callout.sub;
    const { ctx, texture } = this.word;
    ctx.clearRect(0, 0, 1024, 256);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if ("letterSpacing" in ctx) ctx.letterSpacing = "10px";
    ctx.fillStyle = "#ffffff";
    ctx.font = '300 92px "Helvetica Neue", Helvetica, Arial, sans-serif';
    ctx.fillText(text.toUpperCase(), 512, sub ? 100 : 128, 1000);
    if (sub) {
      if ("letterSpacing" in ctx) ctx.letterSpacing = "4px";
      ctx.font = '300 34px "Helvetica Neue", Helvetica, Arial, sans-serif';
      ctx.fillStyle = this.look.palette.accent;
      ctx.fillText(sub, 512, 196, 1000);
    }
    texture.needsUpdate = true;
  }

  // ---- what the game does to the place ----

  local(x, y, out) {
    return out.set((x - W / 2 + 0.5) * S, (y - H / 2 + 0.5) * S, 0);
  }

  // blocks thrown out of the well: they keep the colour they had and go where the stage's current takes them
  throwOut(rows, strength) {
    for (const { y, cells } of rows) cells.forEach((type, x) => {
      if (!type) return;
      const copies = strength > 1.5 ? 2 : 1;
      for (let c = 0; c < copies; c++) {
        this.board.localToWorld(this.local(x, y, tmp));
        // mostly out to the sides and up, some toward you: they stay in view round the well
        tmp2.set(rand(-1, 1) * 200 + (x - W / 2 + 0.5) * 70, rand(-80, 260), rand(60, 360)).multiplyScalar(strength);
        this.spawnDebris(tmp, tmp2, this.colours[type], S * (copies > 1 ? rand(0.45, 0.8) : 0.9));
      }
    });
  }

  spawnDebris(at, velocity, tint, size) {
    const i = this.dNext;
    this.dNext = (this.dNext + 1) % this.debrisMax;
    this.dPos.set([at.x, at.y, at.z], i * 3);
    this.dVel.set([velocity.x, velocity.y, velocity.z], i * 3);
    this.dRot.set([rand(0, 6), rand(0, 6), rand(0, 6)], i * 3);
    this.dSpin.set([rand(-3, 3), rand(-3, 3), rand(-3, 3)], i * 3);
    this.dLife[i] = rand(80, 140);
    this.dSize[i] = size;
    this.debris.setColorAt(i, tint);
    this.debris.instanceColor.needsUpdate = true;
  }

  // a shock through everything loose, from a point
  shock(at, strength, reach) {
    for (let i = 0; i < this.debrisMax; i++) {
      if (this.dLife[i] <= 0) continue;
      tmp.fromArray(this.dPos, i * 3).sub(at);
      const d = tmp.length();
      if (d > reach || d < 1) continue;
      tmp.multiplyScalar((strength * (1 - d / reach)) / d);
      for (let k = 0; k < 3; k++) this.dVel[i * 3 + k] += tmp.getComponent(k);
      for (let k = 0; k < 3; k++) this.dSpin[i * 3 + k] += rand(-1, 1) * strength * 0.004;
    }
    const sv = this.sVel, sp = this.swarm.geometry.attributes.position.array;
    for (let i = 0; i < sv.length / 3; i++) {
      tmp.fromArray(sp, i * 3).sub(at);
      const d = tmp.length();
      if (d > reach || d < 1) continue;
      tmp.multiplyScalar((strength * 0.7 * (1 - d / reach)) / d);
      sv[i * 3] += tmp.x; sv[i * 3 + 1] += tmp.y; sv[i * 3 + 2] += tmp.z;
    }
  }

  react(e) {
    const audio = this.audio, stack = this.stack;
    switch (e.type) {
      case "move": return audio.zoneSound("move", e.x);
      case "rotate": return audio.zoneSound("rotate", e.turn === 3 ? -1 : 1);
      case "hold": return audio.zoneSound("hold");
      case "lock": {
        const mid = e.cells.reduce((s, [x]) => s + x, 0) / 4;
        audio.zoneSound("lock", Math.round(mid / 2));
        const [x, y] = e.cells[0];
        this.board.localToWorld(this.local(x, Math.min(y, H - 1), tmp));
        this.shock(tmp.clone(), 160, 1300);
        this.kickV.y -= 30;
        return;
      }
      case "drop":
        if (e.rows > 1) {
          audio.zoneSound("drop");
          this.kickV.y -= 60 + e.rows * 6;
        }
        return;
      case "clear": {
        const big = e.lines >= 4 || e.spin === "full";
        audio.zoneSound(e.spin ? "spin" : "clear", e.lines);
        if (e.spin) audio.zoneSound("clear", e.lines);
        this.throwOut(e.rows, big ? 1.9 : 1 + e.lines * 0.15);
        this.board.localToWorld(this.local(W / 2, e.rows[0].y, tmp));
        this.shock(tmp.clone(), big ? 700 : 250 + e.lines * 80, big ? 3200 : 1800);
        this.flash = big ? 1 : 0.35 + e.lines * 0.1;
        this.kickV.z -= big ? 260 : 60 * e.lines;
        if (this.boss) return this.hurt(e);
        if (e.label !== "single" || e.combo > 0) this.say(e.label, e.combo > 0 ? `${e.combo + 1} combo` : "", big ? 2.6 : 1.6);
        return;
      }
      case "garbage":
        audio.zoneSound("drop");
        this.kickV.y += 70 + e.rows * 40; // (the floor comes up: the well is pushed up with it)
        this.flash = Math.max(this.flash, 0.2);
        return;
      case "spin": audio.zoneSound("spin"); return this.say(e.label, "", 1.4);
      case "level":
        audio.zoneSound("level");
        return this.say(`level ${e.level}`, "", 1.6);
      case "over": {
        const deep = !!this.boss, won = e.reason === "journey" || e.reason === "deep", best = e.score > this.best;
        this.boss = null;
        stack.killScreen(false);
        audio.zoneSound(won ? "journey" : "over");
        if (best) this.store("zone.best", (this.best = e.score));
        const said = e.reason === "deep" ? "the void is quiet" : deep ? "the void keeps you" : won ? "journey complete" : "game over";
        return this.say(said, () => `${e.score.toLocaleString()}${best ? " · best" : ""} · ${this.keyFor("start", "space")} to ${deep ? "begin again, at the first well" : "play again"}`, 1e9);
      }
    }
  }

  // a clear in the deep void: how much it hurts the void, and the end of it
  hurt(e) {
    const b = this.boss;
    const damage = HURT[e.lines] * (e.spin === "full" ? 1.6 : e.spin === "mini" ? 1.2 : 1) * (e.b2b ? 1.25 : 1) + Math.max(0, e.combo) * 1.5 + (e.perfect ? 20 : 0);
    b.hp = Math.max(0, b.hp - damage);
    this.panelIn = 0;
    if (b.hp <= 0) return this.stack.finish("deep");
    this.say(e.label, `the void · ${Math.ceil(b.hp)} left`, e.lines >= 4 || e.spin ? 2.2 : 1.4);
  }

  // the void's turn: rows from below, more and sooner the weaker it is, and now and then a word
  attack(dt) {
    const b = this.boss;
    if (!b || this.stack.state !== "playing" || this.paused || this.moving || !this.seated) return;
    if ((b.attackIn -= dt) > 0) return;
    const weak = 1 - b.hp / VOID_HP;
    this.stack.garbage(1 + (weak > 0.4 ? 1 : 0) + (weak > 0.75 ? 1 : 0));
    b.attackIn = 11 - weak * 6 + rand(0, 2);
    if (Math.random() < 0.4) this.say(TAUNTS[Math.floor(Math.random() * TAUNTS.length)], "", 1.6);
  }

  // ---- drawing the well ----

  drawWell() {
    const stack = this.stack, minos = this.minos;
    let n = 0;
    // when a block goes (from the top down) and comes again (from the bottom up), with a little of
    // its own so they do not go in rows; by where it is, so it is the same frame after frame
    const order = (index) => {
      const h = THREE.MathUtils.clamp(dummy.position.y / (H * S) + 0.5, 0, 1);
      const j = Math.sin(dummy.position.x * 12.9898 + dummy.position.y * 78.233) * 43758.5453, own = j - Math.floor(j);
      this.order.setXY(index, (1 - h) * 0.75 + own * 0.25, h * 0.75 + own * 0.25);
    };
    const put = (x, y, type, scale = 1, into = minos, index = n++) => {
      this.local(x, y, dummy.position);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(S * 0.94 * scale);
      dummy.updateMatrix();
      into.setMatrixAt(index, dummy.matrix);
      into.setColorAt(index, this.colours[type]);
      if (into === minos) order(index);
    };
    for (let y = 0; y < H + 2; y++) for (let x = 0; x < W; x++) if (stack.rows[y][x]) put(x, y, stack.rows[y][x]);
    const piece = stack.state === "playing" ? stack.piece : null;
    let ghosts = 0;
    if (piece) {
      for (const [x, y] of stack.cells()) if (y < H + 2) put(x, y, piece.type);
      if (this.seated) for (const [x, y] of stack.ghost()) if (y < H) put(x, y, piece.type, 1, this.ghost, ghosts++);
    }
    // hold, on the left; the next five, on the right, the first one largest
    const preview = (type, cx, cy, scale) => {
      const cells = SHAPE[type], w = Math.max(...cells.map(([x]) => x)) + 1, h = Math.max(...cells.map(([, y]) => y)) + 1;
      for (const [x, y] of cells) {
        dummy.position.set(cx + (x - (w - 1) / 2) * S * scale, cy + (y - (h - 1) / 2) * S * scale, 0);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(S * 0.94 * scale);
        dummy.updateMatrix();
        minos.setMatrixAt(n, dummy.matrix);
        order(n);
        minos.setColorAt(n++, this.colours[type]);
      }
    };
    const side = W * S / 2 + 175;
    if (stack.hold) preview(stack.hold, -side, 250, stack.held ? 0.6 : 0.8);
    if (stack.state !== "ready") stack.next(5).forEach((type, i) => preview(type, side, i ? 150 - (i - 1) * 70 : 250, i ? 0.6 : 0.8));
    minos.count = n;
    minos.instanceMatrix.needsUpdate = true;
    this.order.needsUpdate = true;
    if (minos.instanceColor) minos.instanceColor.needsUpdate = true;
    this.ghost.count = ghosts;
    this.ghost.instanceMatrix.needsUpdate = true;
    if (this.ghost.instanceColor) this.ghost.instanceColor.needsUpdate = true;
  }

  drawPanels() {
    const stack = this.stack, s = this.look;
    const font = (size) => `300 ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    const label = (ctx, text, y) => {
      ctx.font = font(26);
      ctx.fillStyle = s.palette.accent;
      if ("letterSpacing" in ctx) ctx.letterSpacing = "6px";
      ctx.fillText(text.toUpperCase(), 256, y);
    };
    const value = (ctx, text, y) => {
      ctx.font = font(52);
      ctx.fillStyle = "#ffffff";
      if ("letterSpacing" in ctx) ctx.letterSpacing = "2px";
      ctx.fillText(text, 256, y);
    };
    {
      const { ctx, texture } = this.left;
      ctx.clearRect(0, 0, 512, 1024);
      ctx.textAlign = "center";
      label(ctx, "hold", 40);
      label(ctx, "score", 330);
      value(ctx, stack.score.toLocaleString(), 392);
      label(ctx, "level", 460);
      value(ctx, `${stack.level}`, 522);
      label(ctx, "lines", 590);
      value(ctx, `${stack.lines}`, 652);
      const t = Math.floor(stack.time);
      label(ctx, "time", 720);
      value(ctx, `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`, 782);
      if (this.boss) {
        // the void, and what is left of it: a bar, under the numbers (where nothing else is)
        label(ctx, "the void", 860);
        ctx.strokeStyle = s.palette.accent;
        ctx.lineWidth = 3;
        ctx.strokeRect(96, 886, 320, 26);
        ctx.fillStyle = s.palette.glow;
        ctx.fillRect(100, 890, 312 * (this.boss.hp / VOID_HP), 18);
        value(ctx, `${Math.ceil(this.boss.hp)}`, 980);
      }
      texture.needsUpdate = true;
    }
    {
      const { ctx, texture } = this.right;
      ctx.clearRect(0, 0, 512, 1024);
      ctx.textAlign = "center";
      label(ctx, "next", 40);
      label(ctx, s.name, 905);
      ctx.font = font(24);
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      if ("letterSpacing" in ctx) ctx.letterSpacing = "3px";
      ctx.fillText(this.atDeep ? "the end of every journey" : `stage ${this.stage + 1} / ${this.stages.length}`, 256, 948);
      if (this.best) ctx.fillText(`best ${this.best.toLocaleString()}`, 256, 990);
      texture.needsUpdate = true;
    }
  }

  // ---- every frame ----

  // the passage to another well, as far as it has come (see setStage)
  passageStep(dt) {
    const p = this.passage, u = this.boardMat.uniforms;
    this.ghost.visible = !p;
    if (!p) return;
    p.t += dt;
    // up and over, eased off and in (the game, and whoever sits at it, carried along)
    const f = THREE.MathUtils.clamp((p.t - GO) / FLY, 0, 1), e = f * f * f * (f * (f * 6 - 15) + 10);
    this.dock.copy(p.from).lerp(p.mid, e).lerp(tmp.copy(p.mid).lerp(p.to, e), e);
    // the dimension turns to the new stage on the way; its name comes as the blocks do
    if (!p.looked && p.t >= GO) { p.looked = true; this.applyLook(); }
    if (p.said && p.t >= GO + FLY) { this.say(...p.said); p.said = null; }
    // the blocks: going, gone, coming; the panels beside the well fade out and in with them
    const coming = p.t >= GO + FLY;
    u.uForming.value = coming ? 1 : 0;
    u.uP.value = coming ? Math.min(1, (p.t - GO - FLY) / COME) : Math.min(1, p.t / GO);
    const shown = coming ? u.uP.value : 1 - u.uP.value;
    for (const panel of this.panels) panel.material.opacity = shown;
    this.streams.visible = true;
    this.streams.material.uniforms.uT.value = p.t;
    if (p.t >= GO + FLY + COME) {
      this.passage = null;
      this.dock.copy(p.to);
      u.uP.value = u.uForming.value = 0;
      for (const panel of this.panels) panel.material.opacity = 1;
      this.streams.visible = false;
    }
  }

  update(dt, camera, velocity) {
    this.camera = camera;
    this.time += dt;
    this.updateGate(dt, camera);
    if (this.world.realm !== ZONE) return;

    const stack = this.stack, beat = this.audio.levels.beat;
    // between runs the dimension is the stage of the well you are nearest (or the one someone else is
    // playing at, while you watch them), and the game's well goes with it
    if (stack.state !== "playing" && !this.seated) {
      const watched = Number.isInteger(this.watching) && this.watching >= 0 && this.watching < this.stages.length ? this.watching : null;
      this.setStage(watched ?? this.nearestWell(camera.position));
    }
    this.passageStep(dt);
    if (this.seated && !this.moving && !this.paused) stack.update(dt);
    for (const e of stack.events.splice(0)) this.react(e);

    // the music fills in as the lines add up: one more part every five lines of a stage
    this.advance();
    this.attack(dt); // (in the deep void: the void's own turn)
    // the music builds through each stage: held back at its start, open by its end; between runs it idles
    const playing = stack.state === "playing" && this.seated, intensity = playing ? Math.round(this.progress * 40) / 40 : 0.35;
    if (intensity !== this.intensity || playing !== this.playingBefore) this.audio.setZoneIntensity((this.intensity = intensity), (this.playingBefore = playing));
    this.ease(1 - Math.exp(-dt * 0.9));

    // the well rocks on a spring when things land in it, or when it is flown into (see collide)
    this.kickV.addScaledVector(this.kick, -90 * dt).multiplyScalar(Math.exp(-7 * dt));
    this.kick.addScaledVector(this.kickV, dt);
    this.board.position.copy(this.dock).add(this.kick);
    this.board.rotation.set(this.kick.y * 0.0006, this.kick.x * 0.0006, 0);
    // the well the game is at rocks with it (once it has arrived there); the others hang still
    this.wells.forEach((well, i) => {
      const rocks = i === this.stage && !this.moving;
      well.group.position.copy(well.at);
      if (rocks) well.group.position.add(this.kick);
      well.group.rotation.copy(rocks ? this.board.rotation : NO_TURN);
    });

    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.boardMat.uniforms.uFlash.value = this.flash * 0.25; // a clear lights the well briefly, gently
    this.drawWell();
    if ((this.panelIn -= dt) <= 0) {
      this.panelIn = 0.1;
      this.drawPanels();
    }

    // the words over the well
    const c = this.callout;
    if (c.life > 0) c.life -= dt;
    this.wordSprite.material.opacity = Math.min(1, Math.max(0, c.life) * 3, c.total < 1e8 ? (c.total - c.life) * 8 : 1);
    this.wordSprite.position.y = 140 + (c.total < 1e8 ? (c.total - c.life) * 14 : 0);

    this.moveLoose(dt, camera, velocity, beat);

    // the player's pictures: one at a time far behind the well, changing every half minute
    const images = this.loaded.images;
    for (const mesh of this.backdrops) mesh.position.set(this.dock.x, this.dock.y, this.dock.z - 9000);
    if (images.length) {
      if ((this.backdropIn -= dt) <= 0) {
        this.backdropIn = 30;
        this.backdropAt = (this.backdropAt + 1) % 2;
        const t = images[Math.floor(Math.random() * images.length)], mesh = this.backdrops[this.backdropAt], img = t.image;
        mesh.material.uniforms.uMap.value = t;
        mesh.visible = true;
        const aspect = img?.width && img?.height ? img.width / img.height : 16 / 9;
        mesh.scale.set(Math.max(30000, 17000 * aspect), Math.max(30000 / aspect, 17000), 1);
      }
      this.backdrops.forEach((mesh, i) => {
        const u = mesh.material.uniforms, target = i === this.backdropAt && u.uMap.value ? 0.4 : 0;
        u.uOpacity.value += (target - u.uOpacity.value) * Math.min(1, dt * 0.8);
      });
    }
    for (const holder of this.models.children) holder.rotation.y += holder.userData.spin * dt;

    // at the well
    const near = this.nearWell;
    this.hintEl.textContent = this.seated ? "" : near ? `${this.keyFor("sit", "P")} · ${stack.state === "playing" ? "back to the well" : "play"}` : "";
  }

  // The wells are solid: you bounce off them, and the game's rocks back from the knock. Returns how hard.
  collide(position, velocity, radius) {
    if (this.world.realm !== ZONE || this.seated) return 0;
    let hit = 0;
    this.wells.forEach((well, i) => { hit = Math.max(hit, this.collideWell(well.group.position, i === this.stage, position, velocity, radius)); });
    return hit;
  }

  collideWell(at, rocks, position, velocity, radius) {
    const half = tmp2.set(W * S / 2 + S * 0.3 + radius, H * S / 2 + S * 0.3 + radius, S * 0.6 + radius);
    const q = tmp.copy(position).sub(at);
    if (Math.abs(q.x) >= half.x || Math.abs(q.y) >= half.y || Math.abs(q.z) >= half.z) return 0;
    // out through the nearest face
    const depth = [half.x - Math.abs(q.x), half.y - Math.abs(q.y), half.z - Math.abs(q.z)], axis = depth.indexOf(Math.min(...depth));
    const n = ACC.set(0, 0, 0).setComponent(axis, Math.sign(q.getComponent(axis)) || 1);
    position.addScaledVector(n, depth[axis]);
    const into = velocity.dot(n);
    if (into >= 0) return 0;
    if (rocks) this.kickV.addScaledVector(n, into * 0.4);
    velocity.addScaledVector(n, -1.55 * into);
    return -into;
  }

  moveLoose(dt, camera, velocity, beat) {
    const tdt = dt, home = this.dock; // everything loose goes round the well the game is at
    const flow = this.look.flow, t = this.time, cam = camera.position, speed = velocity.length();
    const push = (p, v, i, reach, strength) => {
      // flying through things knocks them out of the way, and drags them along a little
      tmp.copy(p).sub(cam);
      const d = tmp.length();
      if (d > reach || d < 1) return;
      const f = 1 - d / reach;
      v.addScaledVector(tmp, (f * (260 + speed * 1.4) * strength * 6 * dt) / d).addScaledVector(velocity, f * strength * 2 * dt);
    };
    const pos = POS, vel = VEL, acc = ACC;

    // blocks out of the well
    const D = this.dPos, V = this.dVel, R = this.dRot, SP = this.dSpin;
    for (let i = 0; i < this.debrisMax; i++) {
      if (this.dLife[i] <= 0) continue;
      this.dLife[i] -= tdt;
      pos.fromArray(D, i * 3);
      vel.fromArray(V, i * 3);
      current(flow, REL.copy(pos).sub(home), t, this.dSeed[i], beat, acc);
      vel.addScaledVector(acc, tdt * 0.6);
      push(pos, vel, i, 160, 1);
      vel.multiplyScalar(Math.exp(-0.5 * tdt));
      pos.addScaledVector(vel, tdt);
      if (pos.distanceTo(home) > 9000) this.dLife[i] = 0;
      pos.toArray(D, i * 3);
      vel.toArray(V, i * 3);
      for (let k = 0; k < 3; k++) {
        R[i * 3 + k] += SP[i * 3 + k] * tdt;
        SP[i * 3 + k] *= Math.exp(-0.15 * tdt);
      }
      const life = this.dLife[i], size = this.dSize[i] * Math.min(1, life / 3);
      dummy.position.copy(pos);
      dummy.rotation.set(R[i * 3], R[i * 3 + 1], R[i * 3 + 2]);
      dummy.scale.setScalar(life > 0 ? size : 0);
      dummy.updateMatrix();
      this.debris.setMatrixAt(i, dummy.matrix);
    }
    this.debris.instanceMatrix.needsUpdate = true;

    // the swarm: the stage's own light, always there, always carried
    const sp = this.swarm.geometry.attributes.position, A = sp.array, SV = this.sVel, seeds = this.swarm.geometry.attributes.aSeed.array;
    for (let i = 0; i < A.length / 3; i++) {
      pos.fromArray(A, i * 3);
      vel.fromArray(SV, i * 3);
      current(flow, REL.copy(pos).sub(home), t, seeds[i], beat, acc);
      vel.addScaledVector(acc, tdt * 0.8);
      push(pos, vel, i, 220, 0.6);
      vel.multiplyScalar(Math.exp(-0.7 * tdt));
      pos.addScaledVector(vel, tdt);
      // drifted too far: it comes back somewhere around the well
      if (pos.distanceTo(home) > 4200) pos.randomDirection().multiplyScalar(rand(400, 2600)).add(home), vel.set(0, 0, 0);
      pos.toArray(A, i * 3);
      vel.toArray(SV, i * 3);
    }
    sp.needsUpdate = true;
    const u = this.swarm.material.uniforms;
    u.uBeat.value = beat;
    u.uLight.value = this.world.G.uLight.value;
  }
}
