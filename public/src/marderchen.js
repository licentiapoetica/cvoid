// marderchen's dimension. A tribute to marderchen: mechatronics technician, builder of glaring
// psychedelic LED light organs and hand-soldered 0603 clocks, lover of cats and rainbows, who put
// all his code on the internet for anyone to use. Fly up through the rainbow ring above the hub
// and you are in the workshop he missed, given back without walls. He lives there, and wuselt.
//
// Everything in WORDS and PROJECTS is his: quoted from marderchen.lima-city.de as he wrote it.
// The sprites are his own avatar and his rainbow cat. "its free use it or parts if you want =^.^="
import * as THREE from "three";
import { CELL, UNIT } from "./constants.js";
import { hashCoords, mulberry32 } from "./noise.js";
import { ORIGIN } from "./spec.js";
import { NOISE_LIB } from "./shaders.js";
import { Museum, MUSEUM_SECTOR } from "./museum.js";

export const REALM = "marderchen";
export const GATE_SECTOR = [0, 1, 0]; // straight up from the hub
const GATE_RADIUS = 36 * UNIT, HOLE = GATE_RADIUS * 0.88; // the ring, and the black hole that fills it (smaller than the portals round the clock: a door of his own)
const CLEAR = HOLE * 4; // how far from its middle you come out of it, either way: well clear of its dark, and of its pull

export const WORDS = [
  "by marderchen just use and have fun",
  "by marderchen use if usefull",
  "hihi have fun with my rainbow snake :3",
  "[MEOW] more rainbowpower!",
  "MEOW its Free use it or parts if you want =^.^= Cats are awesome",
  "[MEOW]", "MEOW!", "MEOW =^.^=", "<<=MEOW=>>", "the question is MEOW", "CATS ARE AWESOME ,,,^.^,,,", "*purrrr*",
  "world have to became cute flashingpsychedeliccolorfull hihihi",
  "its martencode so its free",
  "still trying values for best psychedelic effect",
  "most time spendet for adjusting..",
  "base animation done matrix working :3",
  "just typed+flashed+working hihi",
  "looking like dancing light explosions if watching inside :3",
  "just simply typed down a rainbow",
  "have fun :3 do with it whatever want to",
  "this brainfuck making realy happy :3",
  "caused best way to making worl more cutepowdercolorfull :3",
  "ich kann umsetzen wasimmer ich will",
  "mein hobby=beruf",
  "someday we will all be free *dream*",
];

// names of things he built, from his own file names
const PROJECTS = [
  "Enter-rainbow-world", "72xWS2812 rainbowpowerline", "brainhack VISUALIZER", "MEOW matrix", "catspPURRT spotflasher",
  "Hexagon rainbowflasher", "airdisplay mini rainbow", "0603 glitzertry", "rainbowclock", "colorflashmatrix",
  "psychedelic RGB stroboscope", "WS2812B star", "multirainbowfading", "large matrix roomlamp", "MEOW rainbow visu",
  "optical circle", "optical raster", "optical color wheel", "chaos-generator", "rainbow snake",
  "nosleepcounter 7digs", "MEOW nosleep chiptuneplayer", "cute chaosmind",
  "[MEOW]", "The MEOW", "NEXT CUTE MEOW", "MEOW rainbow", "GO NYAN cats MEOW", "CATZ DANZE", "RAINBOW CATZ", "MEOW-meter", "Stalker meow",
];

const RAINBOW = ["#ff0000", "#ff8800", "#ffff00", "#00ff00", "#00ffff", "#0000ff", "#ff00ff"];
const RING = `ring 30 36 | cube 0 0 0 3.6 3.6 3.6
ring 12 46 | sphere 0 0 0 2.6 2.6 2.6 !`;

// "marderchens MEOW letters": drawn as lines of cubes, the way his wuselline() draws a line as a
// row of little rectangles with a rainbow running along it. The W is his own outline, from
// new_meow_V2_today.txt; the M is that W turned over; E and O are made to match.
const HIS_W = [[174, -132], [219, 143], [279, 143], [315, 90], [343, 143], [403, 143], [447, -110], [451, -132], [447, -132], [386, -132], [355, 25], [311, -53], [272, 25], [243, -132], [174, -132]]
  .map(([x, y]) => [(x - 174) * 0.364, (143 - y) * 0.364]);
const LETTERS = [
  [0, HIS_W.map(([x, y]) => [x, 100 - y])],                                                                             // M
  [116, [[0, 0], [60, 0], [60, 18], [22, 18], [22, 41], [52, 41], [52, 59], [22, 59], [22, 82], [60, 82], [60, 100], [0, 100], [0, 0]]], // E
  [190, [[28, 0], [62, 0], [90, 28], [90, 72], [62, 100], [28, 100], [0, 72], [0, 28], [28, 0]]],                          // O
  [190, [[36, 22], [54, 22], [68, 36], [68, 64], [54, 78], [36, 78], [22, 64], [22, 36], [36, 22]]],
  [296, HIS_W],                                                                                                         // W
];
export function meowBlueprint(cx, cy, cz, height, yaw = 0) {
  const k = height / 100, cos = Math.cos(yaw), sin = Math.sin(yaw), size = (4.2 * k).toFixed(1), out = [];
  const at = (x, y) => [cx + (x - 198) * k * cos, cy + (y - 50) * k, cz - (x - 198) * k * sin];
  for (const [shift, points] of LETTERS) for (let i = 0; i + 1 < points.length; i++) {
    const a = at(points[i][0] + shift, points[i][1]), b = at(points[i + 1][0] + shift, points[i + 1][1]);
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / (6.5 * k)));
    const d = [0, 1, 2].map((j) => ((b[j] - a[j]) / n).toFixed(2));
    out.push(`rep ${n} ${d.join(" ")} | cube ${a.map((v) => v.toFixed(1)).join(" ")} ${size} ${size} ${size} ${(yaw * 57.3).toFixed(0)}${i % 5 === 0 ? " !" : ""}`);
  }
  return out.join("\n");
}

const OPTICAL = [
  "float d = length(p); return smoothstep(0.86, 1.0, sin(d * 9.0 - t * 0.6)) * 0.55;",
  "vec3 g = abs(fract(p * 1.4 + t * 0.02) - 0.5); return smoothstep(0.465, 0.5, max(g.x, max(g.y, g.z))) * 0.5;",
  "float a = atan(p.z, p.x); return smoothstep(0.7, 1.0, sin(a * 12.0 + length(p.xz) * 3.0 - t * 0.5)) * 0.45;",
];

const layer = (o) => ({ kind: "none", primitive: "cube", density: 0.5, scale: 1, order: 1, twist: 0, spin: 0, symmetry: 1, tilt: 0, lift: 0, ...o });
const BLACK = { fog: "#000000", deep: "#000000", glow: "#ff00ff", accent: "#00ffff" };

// The sector in the void that holds the way in.
export const GATE_SPEC = {
  name: "marderchen's door",
  inscription: "fly through the ring :3",
  whispers: ["MEOW", "by marderchen just use and have fun", "[MEOW] more rainbowpower!", "=^.^=", "[MEOW]"],
  // the void around the door looks exactly as it does at the hub: same fog, same sky, same sound.
  // Only the ring itself is his.
  palette: ORIGIN.palette,
  fogDensity: ORIGIN.fogDensity,
  layers: [layer({})],
  noise: {},
  motes: ORIGIN.motes,
  orbs: { count: 0 },
  sound: ORIGIN.sound,
  fieldGlsl: ORIGIN.fieldGlsl,
  blueprint: `${RING}\n${meowBlueprint(0, 66, -80, 30)}`,
  dream: 0.1,
  rainbow: 1,
  source: "marderchen",
};

// One sector in seven is a dark room, and the one to the left of the workshop always is.
export function isDarkRoom(x, y, z) {
  if (x === 0 && y === 0 && z <= 0 && z >= -4) return false; // the workshop and the museum
  return (x === -1 && y === 0 && z === 0) || hashCoords(x * 3 + 11, y * 5 - 7, z * 7 + 3) % 7 === 0;
}

// ---- wuselcode: every one of his source files is a place ----
// The further out you fly, the more of them you find: each .txt in his wuselcode folder has one
// sector of its own, laid out from what the file is (its name, its size, what it drives), with the
// comments he wrote in it hanging in the dark and the code itself running down a board.
let WUSEL = [], PLATZ = new Map(); // the files, and which sector each one has
const LAYOUT = [
  [/ws2812|stripe|powerline|meter|runn/i, "spiral"], [/matrix|lcd|ili|display|tft|gfx|nokia|oled/i, "plane"],
  [/clock|digs|timer|counter|time|uhr/i, "rings"], [/polaris|star|stern|xmas/i, "shell"],
  [/strobo|flash|blitz|flick|irrlight|psy/i, "shards"], [/turbin|fan|cooling|storm|vent/i, "vortex"],
  [/plotter|step|servo|laz0r|engin|knatter|relai/i, "stairs"], [/tesla|hv|invert|plasma|o3|charger|wave|chirp/i, "tendrils"],
  [/meow|cat|as3|furry/i, "swarm"], [/fader|fade|rainbow|rgb|chan|led/i, "lattice"],
];
export function setWuselcode(list) {
  // shuffled once, the same for everyone; then dealt out shell by shell from the workshop outward
  const r = mulberry32(0x77a5e1), files = [...list];
  for (let i = files.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [files[i], files[j]] = [files[j], files[i]]; }
  WUSEL = files;
  PLATZ = new Map();
  let next = 0;
  for (let shell = 1; next < files.length && shell < 12; shell++) {
    const cells = [];
    for (let x = -shell; x <= shell; x++) for (let y = -shell; y <= shell; y++) for (let z = -shell; z <= shell; z++) {
      if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) !== shell) continue;
      if ((x === 0 && y === 0 && z < 0 && z >= -4) || isDarkRoom(x, y, z)) continue; // the museum and the voids keep their places
      cells.push([x, y, z]);
    }
    for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
    for (const cell of cells) if (next < files.length) PLATZ.set(cell.join(","), next++);
  }
}
fetch("/api/wuselcode").then((res) => res.json()).then(setWuselcode).catch(() => {});

function wuselSpec(entry, base, r) {
  const title = entry.file.replace(/\.txt$/, ""), from = (list) => list[Math.floor(r() * list.length)];
  const kind = LAYOUT.find(([rule]) => rule.test(title))?.[1] ?? from(["cage", "fracture", "towers", "recursion", "city"]);
  const count = Number(title.match(/(\d+)\s*(?:x|chan|ch|digs|leds?)/i)?.[1] ?? 0); // "27chan", "720xWs2812B", "6digs"
  return {
    ...base,
    name: title.replace(/_/g, " ").trim().slice(0, 40),
    inscription: (entry.comments[0] ?? "by marderchen use if usefull").slice(0, 118),
    whispers: entry.comments.slice(1, 6).map((c) => c.slice(0, 78)),
    file: entry.file,
    layers: [layer({
      kind, primitive: from(["cube", "cube", "octa", "sphere", "tetra", "cyl"]),
      density: Math.min(0.9, 0.18 + entry.bytes / 45000), scale: 0.5 + r() * 0.9, order: 0.55 + r() * 0.45, twist: r() * 0.7,
      spin: (r() - 0.5) * 0.8, symmetry: count ? (count % 7) + 1 : 1 + Math.floor(r() * 4), tilt: r() < 0.6 ? 0 : r() * 0.6,
    })],
    blueprint: meowBlueprint((r() - 0.5) * 300, (r() - 0.5) * 240, (r() - 0.5) * 300, 40 + r() * 70, r() * Math.PI * 2),
  };
}

// Sectors of the dimension itself. (0,0,0) is his workshop; the rest is LEDs as far as you care to fly.
export function marderSpec(x, y, z) {
  const r = mulberry32(hashCoords(x + 7717, y - 311, z + 90001));
  const from = (list) => list[Math.floor(r() * list.length)];
  const base = {
    palette: BLACK, fogDensity: 0.04, noise: { frequency: 1 + r() * 3, octaves: 2, lacunarity: 2, gain: 0.5, warp: r(), ridge: 0 },
    orbs: { count: 0 }, dream: 0, rainbow: 1, source: "marderchen", blueprint: "",
    sound: { root: 55, mode: "lydian", shimmer: 0.6, darkness: 0.15, pulse: 0, tempo: 138 },
    whispers: [from(WORDS), "[MEOW]", from(WORDS), "MEOW =^.^=", "CATS are awesome!"], fieldGlsl: from(OPTICAL),
    motes: { density: 0.12 + r() * 0.2, size: 1.2, speed: 0.2, drift: from(["rise", "orbit", "stream"]) },
  };
  if (x === 0 && y === 0 && z === 0) {
    return {
      ...base,
      name: "marderchen's dimension",
      inscription: "by marderchen just use and have fun :3",
      layers: [
        layer({ kind: "plane", density: 1, scale: 0.9, lift: -0.8 }),                       // the big matrix
        layer({ kind: "rings", primitive: "octa", density: 0.5, scale: 0.8, twist: 0.12, spin: 0.5, lift: 0.9 }),
      ],
      orbs: { count: 7, colors: RAINBOW },
      blueprint: `${RING}
cube -150 -110 -60 120 6 60
rep 2 110 0 0 | cube -205 -128 -60 6 36 50
rep 5 20 0 0 | cube -190 -104 -70 12 3 18 !
cyl -110 -98 -45 4 16 4
${meowBlueprint(0, 235, -250, 110)}`,
    };
  }
  // the museum fills the sector behind the clock and reaches into the ones above and below it
  if (x === 0 && y === 0 && z <= MUSEUM_SECTOR[2] && z >= -4) {
    return {
      ...base, name: "marderchen's museum", inscription: "[MEOW] do with it whatever want to :3   E opens a piece", layers: [layer({})],
      blueprint: z === -1 ? meowBlueprint(0, 250, 290, 95) : "", // MEOW over the mouth of the tunnel
      motes: { density: 0.08, size: 1, speed: 0.1, drift: "rise" }, fieldGlsl: "return 0.0;", whispers: [],
    };
  }
  // dark rooms: nothing in them but his chaostyper, writing
  if (isDarkRoom(x, y, z)) {
    return {
      ...base, name: "void", inscription: "", layers: [layer({})], whispers: [], rainbow: 0, blueprint: "", source: "chaostyper",
      motes: { density: 0, size: 1, speed: 0, drift: "still" }, fieldGlsl: "return 0.0;", fogDensity: 0.3,
      sound: { root: 41, mode: "phrygian", shimmer: 0, darkness: 0.9, pulse: 0, tempo: 143 },
    };
  }
  const platz = PLATZ.get(`${x},${y},${z}`);
  if (platz !== undefined) return wuselSpec(WUSEL[platz], base, r);
  if (r() < 0.22) return { ...base, name: "dark between the lamps", inscription: "", layers: [layer({})], whispers: [from(WORDS)] };
  const kind = from(["plane", "towers", "rings", "spiral", "lattice", "shell", "vortex", "cage", "recursion", "swarm", "tendrils"]);
  return {
    ...base,
    name: from(PROJECTS),
    inscription: from(WORDS),
    // there is a MEOW in every place
    blueprint: meowBlueprint((r() - 0.5) * 300, (r() - 0.5) * 240, (r() - 0.5) * 300, 40 + r() * 90, r() * Math.PI * 2),
    layers: [layer({
      kind, primitive: from(["cube", "cube", "octa", "sphere", "tetra"]), density: 0.25 + r() * 0.6, scale: 0.5 + r() * 0.9,
      order: 0.6 + r() * 0.4, twist: r() * 0.6, spin: (r() - 0.5) * 0.8, symmetry: r() < 0.5 ? 1 : 2 + Math.floor(r() * 5),
      tilt: r() < 0.6 ? 0 : r() * 0.6,
    })],
  };
}

// ---- his code, ported. The function and variable names are his. ----

// rainbowcalc(): "old system i created but still best linear rainbow solution i think"
// rainbow runs 0..2405; duty[0..2] is rot, grun, blau, each 0..400.
const duty = [0, 0, 0];
function rainbowcalc(rainbow) {
  rainbow = ((Math.round(rainbow) % 2406) + 2406) % 2406;
  if (rainbow >= 0 && rainbow <= 400) { duty[0] = 400; duty[1] = rainbow; duty[2] = 0; }                           //rot  ->gelb  (rotmax grün+ blau0)
  if (rainbow >= 401 && rainbow <= 801) { duty[0] = 400 - (rainbow - 401); duty[1] = 400; duty[2] = 0; }           //gelb ->grün  (rot- grünmax blau0)
  if (rainbow >= 802 && rainbow <= 1202) { duty[0] = 0; duty[1] = 400; duty[2] = rainbow - 802; }                  //grün ->cyan  (rot0 grünmax blau+)
  if (rainbow >= 1203 && rainbow <= 1603) { duty[0] = 0; duty[1] = 400 - (rainbow - 1203); duty[2] = 400; }        //cyan ->blau  (rot0 grün- blaumax)
  if (rainbow >= 1604 && rainbow <= 2004) { duty[0] = rainbow - 1604; duty[1] = 0; duty[2] = 400; }                //blau ->lila  (rot+ grün0 blaumax)
  if (rainbow >= 2005 && rainbow <= 2405) { duty[0] = 400; duty[1] = 0; duty[2] = 400 - (rainbow - 2006); }        //lila ->rot   (rotmax grün0 blau-)
  return duty;
}
const random = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo)); // Arduino's random(lo, hi)

// ratemal(): the sequence generator from his beat flashers ("orderd chaos"). A table of steps by
// channels, a few cells lit at each channel's own brightness; every step on the beat fires the
// lit ones, and downfade() lets them die away. Here the channels are every LED in the dimension.
const sqsteps = 32, channelz = 18;
class Brainhack {
  constructor(strop) {
    this.strop = strop; // what each channel is showing right now, 0..1
    this.blinkdata = Array.from({ length: sqsteps + 1 }, () => new Uint8Array(channelz));
    this.helligkeiten = new Uint8Array(channelz);
    this.beatsplit = -1;
    this.runden = 0;
    this.dicht = 9; // lit cells in a hundred; his flashers used 2, a whole dimension of LEDs wants more
    this.ratemal();
  }

  ratemal() {
    for (let tik = 0; tik <= sqsteps; tik++) for (let tok = 0; tok < channelz; tok++) this.blinkdata[tik][tok] = 0;
    for (let wusch = 0; wusch < channelz; wusch++) this.helligkeiten[wusch] = random(0, 3) * 20 + 40;
    // his flashers light 2 cells in a hundred; a whole dimension of LEDs wants a few more
    for (let wisch = 0; wisch <= sqsteps; wisch++) for (let wasch = 0; wasch < channelz; wasch++) {
      if (random(0, 100) <= this.dicht) this.blinkdata[wisch][wasch] = this.helligkeiten[wasch];
    }
  }

  zeitreise(sixteenth, dt) {
    const step = Math.floor(sixteenth);
    if (sixteenth >= 0 && step !== this.beatsplit) {
      this.beatsplit = step;
      const tik = step % (sqsteps + 1);
      if (tik === 0 && ++this.runden % 4 === 0) this.ratemal(); // still trying values for best psychedelic effect
      for (let tok = 0; tok < channelz; tok++) if (this.blinkdata[tik][tok] > 0) this.strop[tok] = this.blinkdata[tik][tok] / 80;
    }
    this.downfade(dt);
  }

  downfade(dt) {
    for (let tok = 0; tok < channelz; tok++) this.strop[tok] *= Math.exp(-dt * 4.2);
  }
}

// wuselfarben(): his 720x WS2812B matrix animation, here 12 lines of 40.
// "random color pixel fall down... fall downpixel mix storring on ground..
//  mix fall together 2same colors together flickering again and all same colors gone.. continiues :3
//  stripe full with bad chaos mix until 20leds left.. all flickering and gone.."
const lines = 12, stripe = 40, FARBEN = [0, 340, 700, 1000, 1400, 1800, 2150]; // rainbow positions a pixel can have
class Meowmeter {
  constructor() {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ fog: false }), lines * stripe);
    this.mesh.frustumCulled = false;
    const m = new THREE.Object3D(), pitch = 7 * UNIT;
    for (let linie = 0; linie < lines; linie++) for (let y = 0; y < stripe; y++) {
      m.position.set((linie - (lines - 1) / 2) * pitch, (y - stripe / 2) * pitch, 0);
      m.scale.setScalar(pitch * 0.72);
      m.updateMatrix();
      this.mesh.setMatrixAt(linie * stripe + y, m.matrix);
    }
    // leddata[linie][y]: -1 black, else a colour index; flicker counts down to "gone"
    this.leddata = Array.from({ length: lines }, () => new Int8Array(stripe).fill(-1));
    this.flicker = Array.from({ length: lines }, () => new Uint8Array(stripe));
    this.fallend = []; // pixels on their way down: { linie, y, farbe }
    this.timernewpix = 0;
    this.rander = 6;
    this.littletime = 0;
    this.colour = new THREE.Color();
  }

  wuselfarben() {
    const { leddata, flicker } = this;
    if (++this.timernewpix >= this.rander) {
      this.timernewpix = 0;
      this.rander = random(2, 7);
      const undmich = random(0, lines);
      if (leddata[undmich][stripe - 1] < 0) this.fallend.push({ linie: undmich, y: stripe - 1, farbe: random(0, FARBEN.length) });
    }
    for (let i = this.fallend.length - 1; i >= 0; i--) {
      const p = this.fallend[i], reihe = leddata[p.linie];
      if (p.y > 0 && reihe[p.y - 1] < 0) { p.y--; continue; }  //fallrunter wen nächster schwarz
      reihe[p.y] = p.farbe;                                      //überneme gamedata an position
      this.fallend.splice(i, 1);
      if (p.y > 0 && reihe[p.y - 1] === p.farbe) {              //erkenne doppelfarbe setz gleich flacker
        flicker[p.linie][p.y] = flicker[p.linie][p.y - 1] = 22;
        for (const rechts of [p.linie - 1, p.linie + 1]) {       //suchfarben auchso flackernsolle
          if (rechts < 0 || rechts >= lines) continue;
          for (const y of [p.y, p.y - 1]) if (leddata[rechts][y] === p.farbe) flicker[rechts][y] = 22;
        }
      }
      if (p.y > stripe - 8) for (let l = 0; l < lines; l++) for (let y = 0; y < stripe; y++) if (leddata[l][y] >= 0) flicker[l][y] = 30; //alles weg wen zuwenig platz überig
    }
    for (let l = 0; l < lines; l++) {
      const reihe = leddata[l];
      for (let y = 0; y < stripe; y++) {
        if (flicker[l][y] > 0 && --flicker[l][y] === 0) reihe[y] = -1; // flickering and gone
        // mix fall together
        if (y > 0 && reihe[y] >= 0 && reihe[y - 1] < 0 && flicker[l][y] === 0) { reihe[y - 1] = reihe[y]; reihe[y] = -1; }
      }
    }
  }

  update(dt, time) {
    for (this.littletime += dt; this.littletime >= 0.045; this.littletime -= 0.045) this.wuselfarben();
    const show = (linie, y, farbe, hell) => {
      const d = rainbowcalc(FARBEN[farbe] + time * 30);
      this.mesh.setColorAt(linie * stripe + y, this.colour.setRGB((d[0] / 400) * hell, (d[1] / 400) * hell, (d[2] / 400) * hell));
    };
    for (let l = 0; l < lines; l++) for (let y = 0; y < stripe; y++) {
      const farbe = this.leddata[l][y];
      if (farbe < 0) this.mesh.setColorAt(l * stripe + y, this.colour.setRGB(0.012, 0.012, 0.018));
      else show(l, y, farbe, this.flicker[l][y] ? (this.flicker[l][y] % 4 < 2 ? 1.5 : 0.25) : 0.9);
    }
    for (const p of this.fallend) show(p.linie, p.y, p.farbe, 1.2);
    this.mesh.instanceColor.needsUpdate = true;
  }
}

// malneu() / wusely(): his "chaostyper" (textwriter.html), ported line for line. It writes one
// sentence a letter at a time at a random pace, with one character of chaos flickering on the
// end, in a colour that swings through the red end of his 500-step rainbow. Then it starts again.
//
// Here it is a void. Step into one of these sectors and the dimension is gone: no rainbow, no
// music, no cats, no MEOW. Only black walls in every direction, and on every wall the same
// sentence writing itself, starting again, writing itself. The maze has no edge: walk or fly as
// far as you like and it is the same few corridors coming round again. It only lets go of
// someone who surges.
//
// From outside it is a grey cloud: it thickens and darkens toward the middle, and the black is
// only there once you are in it.
const MAZE = 4, GANG = 150, PERIOD = MAZE * GANG, SIGHT = 300, HALF = 1000; // cells per side, corridor width, repeat distance, how far the text can be seen, half the black room
const CLOUD = CELL / 2 - 20; // half the box the cloud is drawn in; it stays inside its sector
const CLOUD_FRAG = /* glsl */ `
uniform float uTime, uFogDensity, uLight;
uniform vec3 uFogColor, uGlow;
varying vec3 vWorld, vCentre;
${NOISE_LIB}
// a rounded block that holds the black room with room to spare, its surface pushed about by noise
float shape(vec3 p, vec3 seed, out float n) {
  vec3 q = abs(p) - vec3(1300.);
  float sd = length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.) - 650.;
  n = 0.;
  if (sd > 600. || sd < -950.) return sd; // out of the noise's reach either way
  vec3 s = p / 900. + seed + vec3(0., uTime * 0.012, uTime * 0.006);
  n = snoise(s) * 0.55 + snoise(s * 2.1) * 0.28 + snoise(s * 4.3) * 0.14;
  return sd + n * 600.;
}
void main() {
  vec3 ro = cameraPosition - vCentre, rd = vWorld - cameraPosition;
  float far = length(rd);
  rd /= far;
  vec3 a = (-vec3(${CLOUD}.) - ro) / rd, b = (vec3(${CLOUD}.) - ro) / rd, lo = min(a, b);
  float near = max(max(max(lo.x, lo.y), lo.z), 0.);
  const float STEP = 60.;
  float t = near + STEP * hash(vec3(gl_FragCoord.xy, 3.)); // dithered start, against banding
  vec3 seed = vCentre / ${CELL}. * 7.31, col = vec3(0.);
  float clear = 1.;
  for (int i = 0; i < 72; i++) {
    if (t > far || clear < 0.01) break;
    vec3 p = ro + rd * t;
    float n, sd = shape(p, seed, n);
    if (sd > 600.) { t += max(sd - 580., STEP); continue; } // empty air: the noise cannot reach this far out
    float d = smoothstep(0., 350., -sd) * smoothstep(${CLOUD}., ${CLOUD - 150}., max(abs(p.x), max(abs(p.y), abs(p.z))));
    if (d > 0.001) {
      float take = 1. - exp(-d * STEP * 0.004);
      float deep = exp(-max(-sd - 200., 0.) / 400.); // black at the heart, where the room is
      float lit = 0.6 + 0.4 * clamp(p.y / 2400. + n * 0.6 + 0.3, 0., 1.); // paler on top
      vec3 c = (vec3(0.21, 0.21, 0.225) * lit + uGlow * 0.015) * deep * min(uLight, 1.5);
      float f = t * uFogDensity;
      c = mix(c, uFogColor, 1. - exp(-f * f));
      col += clear * take * c;
      clear *= 1. - take;
    }
    t += STEP;
  }
  gl_FragColor = vec4(col, 1. - clear);
}`;
class Chaostyper {
  constructor(G) {
    this.chosencolor = 0;
    this.chaoscach = "124567890qwertyuiopljhgfdsazxcvbnm QWERTYUIOPLKJHGFDSAZXCVBNM_________?!?!&*℅™^°=~|•√Π÷×¶∆______ ";
    this.mewspeak = " don't know the future seens to be an error !MEOW! funnytextcreation isnt it? wiRrRrRr X›";
    this.cachtimestap = 10; this.country = 0; this.mehr = 1; this.haarkneul = "";
    this.takt = 0;
    this.inside = 0; // seconds the traveller has been in here

    // one canvas, tiled up every wall: every copy writes in step
    this.canvas = document.createElement("canvas");
    this.canvas.width = 1024;
    this.canvas.height = 512;
    this.ctx = this.canvas.getContext("2d");
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.wrapT = THREE.RepeatWrapping;

    // black inside and out, big enough to shut the rainbow out
    this.room = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, HALF * 2, HALF * 2), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, fog: false }));
    this.room.visible = false;

    // a maze on a torus: carved with a depth-first walk that wraps at the edges, so that it joins
    // up with itself on every side. west[x][z] is the wall on the west of a cell, north[x][z] on its north.
    const r = mulberry32(0x3e0), west = new Set(), north = new Set(), besucht = new Set(["0,0"]), stapel = [[0, 0]];
    for (let x = 0; x < MAZE; x++) for (let z = 0; z < MAZE; z++) { west.add(`${x},${z}`); north.add(`${x},${z}`); }
    const mod = (n) => ((n % MAZE) + MAZE) % MAZE;
    while (stapel.length) {
      const [x, z] = stapel.at(-1);
      const frei = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => !besucht.has(`${mod(x + dx)},${mod(z + dz)}`));
      if (!frei.length) { stapel.pop(); continue; }
      const [dx, dz] = frei[Math.floor(r() * frei.length)], nx = mod(x + dx), nz = mod(z + dz);
      if (dx === 1) west.delete(`${nx},${z}`); if (dx === -1) west.delete(`${x},${z}`);
      if (dz === 1) north.delete(`${x},${nz}`); if (dz === -1) north.delete(`${x},${z}`);
      besucht.add(`${nx},${nz}`);
      stapel.push([nx, nz]);
    }
    const wande = []; // x, z, turned?
    for (let tx = -1; tx <= 1; tx++) for (let tz = -1; tz <= 1; tz++) for (let x = 0; x < MAZE; x++) for (let z = 0; z < MAZE; z++) {
      const ox = tx * PERIOD + (x - MAZE / 2) * GANG, oz = tz * PERIOD + (z - MAZE / 2) * GANG;
      if (west.has(`${x},${z}`)) wande.push([ox, oz + GANG / 2, true]);
      if (north.has(`${x},${z}`)) wande.push([ox + GANG / 2, oz, false]);
    }
    // The text fades to black a short way off, so there is never anything to see but the next few
    // walls. Each wall is two faces, so it reads the right way round from either side.
    const hoch = PERIOD * 3;
    this.faces = new THREE.InstancedMesh(new THREE.PlaneGeometry(GANG, hoch), new THREE.ShaderMaterial({
      uniforms: { map: { value: this.texture }, uRepeat: { value: hoch / (GANG / 2) }, uSight: { value: SIGHT } },
      vertexShader: `varying vec2 vUv; varying vec3 vWorld;
        void main(){ vUv = uv; vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      // distance is taken per pixel: the walls are tall, and from their corners everything looks far away
      fragmentShader: `uniform sampler2D map; uniform float uRepeat, uSight; varying vec2 vUv; varying vec3 vWorld;
        void main(){ vec3 c = texture2D(map, vec2(vUv.x, fract(vUv.y * uRepeat))).rgb; gl_FragColor = vec4(c * (1. - smoothstep(uSight * 0.45, uSight, distance(vWorld, cameraPosition))), 1.); }`,
    }), wande.length * 2);
    const m = new THREE.Object3D();
    wande.forEach(([x, z, turned], i) => {
      for (const side of [0, 1]) {
        m.position.set(x + (turned ? side - 0.5 : 0), 0, z + (turned ? 0 : side - 0.5));
        m.rotation.y = turned ? (side ? Math.PI / 2 : -Math.PI / 2) : (side ? 0 : Math.PI);
        m.updateMatrix();
        this.faces.setMatrixAt(i * 2 + side, m.matrix);
      }
    });
    this.faces.frustumCulled = false;
    this.room.add(this.faces);

    // the clouds, one round each dark room near enough to be seen, drawn from the inside of their box
    this.clouds = new THREE.InstancedMesh(new THREE.BoxGeometry(CLOUD * 2, CLOUD * 2, CLOUD * 2), new THREE.ShaderMaterial({
      uniforms: { uTime: G.uTime, uFogDensity: G.uFogDensity, uLight: G.uLight, uFogColor: G.uFogColor, uGlow: G.uGlow },
      vertexShader: `varying vec3 vWorld, vCentre;
        void main(){ mat4 m = modelMatrix * instanceMatrix; vec4 wp = m * vec4(position, 1.); vWorld = wp.xyz; vCentre = m[3].xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: CLOUD_FRAG,
      side: THREE.BackSide, transparent: true, premultipliedAlpha: true, depthWrite: false,
    }), 125);
    this.clouds.count = 0;
    this.clouds.frustumCulled = false;
  }

  malneu() {
    this.country++; this.haarkneul = "";
    if (this.country > this.cachtimestap) {
      this.country = 0; this.mehr++;
      if (this.mehr >= this.mewspeak.length) this.mehr = 1;
      this.cachtimestap = Math.random() * 7 + 2;
    }
    for (let wz = 0; wz < this.mehr; wz++) this.haarkneul += this.mewspeak[wz];
    const randz = Math.random() * this.chaoscach.length;
    if (randz < this.chaoscach.length - 1) this.haarkneul += this.chaoscach[Math.round(randz)];
    this.wusely();
  }

  wusely() {
    this.chosencolor += 0.2;
    const { ctx } = this, step = Math.round(Math.sin(this.chosencolor) * 100) + 400; // rainbow[step] of 500
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, 1024, 512);
    ctx.font = "62px serif";
    ctx.fillStyle = `hsl(${(step / 500) * 360}, 100%, 50%)`;
    // on a wall the line has to break; his page was one long line
    for (let row = 0; row * 30 < this.haarkneul.length; row++) ctx.fillText(this.haarkneul.slice(row * 30, row * 30 + 30), 34, 110 + row * 118);
    this.texture.needsUpdate = true;
  }

  tick(dt) {
    for (this.takt += dt; this.takt >= 0.06; this.takt -= 0.06) this.malneu(); // 60ms ticks, like his setTimeout
  }

  // Stands in whichever of these sectors is nearest. Returns true while the traveller is inside.
  update(dt, camera, surge) {
    const cx = Math.round(camera.position.x / CELL), cy = Math.round(camera.position.y / CELL), cz = Math.round(camera.position.z / CELL);
    let best = null, bestD = Infinity;
    const near = [];
    for (let x = cx - 2; x <= cx + 2; x++) for (let y = cy - 2; y <= cy + 2; y++) for (let z = cz - 2; z <= cz + 2; z++) {
      if (!isDarkRoom(x, y, z)) continue;
      const d = tmp.set(x * CELL, y * CELL, z * CELL).distanceToSquared(camera.position);
      near.push([d, x, y, z]);
      if (d < bestD) bestD = d, best = [x, y, z];
    }
    // furthest first, so that nearer clouds are laid over the ones behind them
    near.sort((a, b) => b[0] - a[0]);
    near.forEach(([, x, y, z], i) => this.clouds.setMatrixAt(i, place.makeTranslation(x * CELL, y * CELL, z * CELL)));
    this.clouds.count = near.length;
    this.clouds.instanceMatrix.needsUpdate = true;

    const centre = best && this.room.position.set(best[0] * CELL, best[1] * CELL, best[2] * CELL), p = camera.position;
    const inside = !!best && Math.max(Math.abs(p.x - centre.x), Math.abs(p.y - centre.y), Math.abs(p.z - centre.z)) <= HALF;
    this.room.visible = inside;
    this.clouds.visible = !inside;
    if (!inside) return (this.inside = 0, false);
    for (this.takt += dt; this.takt >= 0.06; this.takt -= 0.06) this.malneu(); // 60ms ticks, like his setTimeout
    this.inside += dt;
    if (!surge) {
      // no edge: past half a repeat in any direction you are set back by a whole one, and since
      // everything repeats there is nothing to tell you that it happened
      for (const axis of ["x", "y", "z"]) {
        const off = p[axis] - centre[axis];
        if (Math.abs(off) > PERIOD / 2) p[axis] -= Math.round(off / PERIOD) * PERIOD;
      }
    }
    return true;
  }
}

// What he can do to the place. Each is something he built or scripted.
export const EFFECTS = ["rainbowpower", "ratemal", "meowchor", "firework", "optical", "starflakes", "meowletters", "lightsoff"];

// the signature he put at the end of his programs
const CATS = String.raw`
       ___
   _.-|   | /           |\__/,|    (` + "`" + String.raw`\
  {   |   | --          |^ ^  |__  _) )
   "-.|___| \         _.( Y   )  ` + "`" + String.raw`   /
     .--'-` + "`" + String.raw`-.      _((_ ` + "`" + String.raw`^--' /__<  \
....-+|______|__.-||__)` + "`" + String.raw`-' (((/   (((/
CATS are awesome!`;

// ---- the 0603 clock: six digits and two colons, every segment its own colour ----

const SEGMENTS = [ // x, y, horizontal?
  [0, 2, 1], [1, 1, 0], [1, -1, 0], [0, -2, 1], [-1, -1, 0], [-1, 1, 0], [0, 0, 1],
];
const DIGITS = ["1111110", "0110000", "1101101", "1111001", "0110011", "1011011", "1011111", "1110000", "1111111", "1111011"];

class Clock {
  constructor() {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ fog: false }), 6 * 7 + 4);
    this.mesh.position.set(0, 150 * UNIT, -330 * UNIT);
    this.mesh.frustumCulled = false;
    this.slots = [];
    const m = new THREE.Object3D(), s = 16 * UNIT;
    for (let d = 0; d < 6; d++) {
      const cx = (d - 2.5) * 4.2 * s + (Math.floor(d / 2) - 1) * 1.6 * s;
      for (const [x, y, flat] of SEGMENTS) {
        m.position.set(cx + x * s, y * s, 0);
        m.scale.set(flat ? s * 1.5 : s * 0.4, flat ? s * 0.4 : s * 1.5, s * 0.4);
        m.updateMatrix();
        this.slots.push(m.matrix.clone());
      }
    }
    for (const gap of [-1, 1]) for (const y of [-1, 1]) {
      m.position.set(gap * 4.95 * s, y * s, 0);
      m.scale.setScalar(s * 0.45);
      m.updateMatrix();
      this.slots.push(m.matrix.clone());
    }
    this.off = new THREE.Matrix4().makeScale(0, 0, 0);
    this.colour = new THREE.Color();
    this.second = -1;
  }

  // returns true when the second has just changed
  update(time) {
    const now = new Date(), second = now.getSeconds();
    const text = [now.getHours(), now.getMinutes(), second].map((n) => String(n).padStart(2, "0")).join("");
    for (let i = 0; i < this.slots.length; i++) {
      const lit = i >= 42 ? second % 2 === 0 : DIGITS[text[Math.floor(i / 7)]][i % 7] === "1";
      this.mesh.setMatrixAt(i, lit ? this.slots[i] : this.off);
      const d = rainbowcalc(i * 50 + time * 290); // running rainbows, as on his 88x0603 rainbow clock
      this.mesh.setColorAt(i, this.colour.setRGB(d[0] / 400, d[1] / 400, d[2] / 400));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    const ticked = second !== this.second;
    this.second = second;
    return ticked;
  }
}

function textSprite(width, height, scale) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  sprite.scale.set(scale, (scale * height) / width, 1);
  return { sprite, ctx: canvas.getContext("2d"), texture };
}

const forward = new THREE.Vector3(), tmp = new THREE.Vector3(), place = new THREE.Matrix4();
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const AVATAR_FRAMES = 29, AVATAR_USED = 16, CAT_FRAMES = 10; // the avatar's later frames are full-screen colour flashes; left out

export class Marderchen {
  constructor({ scene, world, audio, textEl, stored, store, arrive }) {
    Object.assign(this, { scene, world, audio, textEl, store, arrive });
    // The door is a portal: a small vortex of rainbow light just above and below the ring that turns
    // and narrows into it. It only pulls right in front of the ring: the last stretch of flying in.
    const arms = 6, perArm = 40;
    this.vortex = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ fog: false }), arms * perArm * 2);
    this.vortex.frustumCulled = false;
    this.vortexT = new Float32Array(arms * perArm * 2);
    const v = new THREE.Object3D();
    for (let half = 0; half < 2; half++) for (let arm = 0; arm < arms; arm++) for (let k = 0; k < perArm; k++) {
      const t = (k + 1) / perArm, i = (half * arms + arm) * perArm + k;
      const angle = (arm / arms) * Math.PI * 2 + t * 4 * (half ? -1 : 1), radius = 40 + 210 * t ** 1.6;
      v.position.set(Math.cos(angle) * radius, (half ? -1 : 1) * t * 250, Math.sin(angle) * radius); // a small funnel either side of the ring
      v.rotation.set(0, -angle, 0);
      v.scale.set(2 + t * 2, 2 + t * 2, 6 + t * 6);
      v.updateMatrix();
      this.vortex.setMatrixAt(i, v.matrix);
      this.vortexT[i] = t;
    }
    this.vortex.scale.setScalar(0.3);
    this.vortex.visible = false; // nothing of it shows until you are at the door
    this.fade = 0; // how dark it is at his door (main.js draws it)
    this.veil = 0; // the dark that lifts after you come through
    scene.add(this.vortex);
    // The door is a black hole: a ball of nothing filling the ring. You cannot see through it or
    // past it from any side, and for a moment as you go in there is only black.
    this.hole = new THREE.Mesh(new THREE.SphereGeometry(HOLE, 40, 24), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, fog: false }));
    this.hole.visible = false;
    scene.add(this.hole);
    this.pull = new THREE.Vector3(); // what the portal adds to the traveller's flight
    this.roll = 0;                   // and how far it has spun them
    this.eject = 0;                  // seconds left of being thrown clear on the far side

    this.group = new THREE.Group(); // everything that only exists inside the dimension
    this.roam = new THREE.Group();  // him, his cats and his loose lights: these can turn up in the void too
    this.roam.visible = false;
    scene.add(this.roam);
    this.group.visible = false;
    scene.add(this.group);
    this.side = 0;
    this.time = 0;
    this.inside = 0;        // seconds spent in here this visit
    this.said = stored("marderchen.said", []);
    this.speakIn = 0;
    this.asking = false;
    this.lineTimers = [];

    const load = (url) => {
      const t = new THREE.TextureLoader().load(url);
      t.colorSpace = THREE.SRGBColorSpace;
      t.magFilter = t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      return t;
    };

    // him: his own pixel avatar
    this.avatar = load("/marderchen/avatar.png");
    this.avatar.repeat.set(1 / AVATAR_FRAMES, 1);
    this.body = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.avatar, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    this.body.scale.setScalar(56 * UNIT * 0.5);
    this.roam.add(this.body);
    this.position = this.body.position.set(60, -40, -160);
    this.target = this.position.clone();
    this.pause = 1;
    this.speed = 300;
    this.facing = 1;

    // his cats
    const catMap = load("/marderchen/catz.png");
    this.cats = Array.from({ length: 16 }, (_, i) => {
      const map = catMap.clone();
      map.repeat.set(1 / CAT_FRAMES, 1);
      const cat = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: false }));
      cat.scale.set(30, 24.6, 1);
      cat.position.copy(this.position);
      this.roam.add(cat);
      // the first few stay with him; the rest have the run of the place and keep the visitor company
      return { cat, map, phase: i * 1.3, lag: 0.6 + (i % 5) * 0.4, radius: 40 + (i % 7) * 16, stray: i >= 6, meowIn: 3 + Math.random() * 14 };
    });

    // the sparkle he leaves behind, after his cursor script
    const count = 90;
    this.sparkle = new THREE.Points(
      new THREE.BufferGeometry()
        .setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3))
        .setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3), 3)),
      new THREE.PointsMaterial({ size: 5, vertexColors: true, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }),
    );
    this.sparkle.frustumCulled = false;
    this.sparkleAge = new Float32Array(count).fill(99);
    this.sparkleNext = 0;
    this.sparkleTimer = 0;
    this.roam.add(this.sparkle);

    this.clock = new Clock();
    this.group.add(this.clock.mesh);

    this.brainhack = new Brainhack(world.G.uChan.value);

    this.meowmeter = new Meowmeter();
    this.meowmeter.mesh.position.set(330 * UNIT, 30 * UNIT, -40 * UNIT);
    this.meowmeter.mesh.rotation.y = -Math.PI / 2;
    this.group.add(this.meowmeter.mesh);

    const cats = textSprite(640, 220, 300 * UNIT * 0.5);
    cats.ctx.font = "20px monospace";
    cats.ctx.fillStyle = "#ff00ff";
    CATS.split("\n").forEach((line, i) => cats.ctx.fillText(line, 8, 6 + i * 26));
    cats.texture.needsUpdate = true;
    cats.sprite.position.set(-170 * UNIT, -40 * UNIT, -70 * UNIT);
    this.group.add(cats.sprite);

    // his own comments, straight out of his source files, on the wall by the workbench
    this.kote = [];
    this.koteLines = [0, 1, 2, 3].map((i) => {
      const line = textSprite(1024, 64, 620 * UNIT * 0.5);
      line.sprite.position.set(-300 * UNIT, (70 - i * 34) * UNIT, -210 * UNIT);
      line.next = 1 + i * 2.3;
      this.group.add(line.sprite);
      return line;
    });
    this.typer = new Chaostyper(world.G);
    this.roam.add(this.typer.room);
    this.group.add(this.typer.clouds);

    // loose lights for his fireworks and starflakes
    const sparks = 700;
    this.sparks = new THREE.Points(
      new THREE.BufferGeometry()
        .setAttribute("position", new THREE.BufferAttribute(new Float32Array(sparks * 3), 3))
        .setAttribute("color", new THREE.BufferAttribute(new Float32Array(sparks * 3), 3)),
      new THREE.PointsMaterial({ size: 7, vertexColors: true, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }),
    );
    this.sparks.frustumCulled = false;
    this.spark = Array.from({ length: sparks }, () => ({ life: 0, v: new THREE.Vector3(), hue: 0 }));
    this.sparkNext = 0;
    this.roam.add(this.sparks);

    // a MEOW he can put up in front of a visitor, built from the same letters as the others
    const cubes = [];
    for (const [shift, points] of LETTERS) for (let i = 0; i + 1 < points.length; i++) {
      const [ax, ay] = points[i], [bx, by] = points[i + 1], n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 6.5));
      for (let k = 0; k < n; k++) cubes.push([ax + shift + ((bx - ax) * k) / n - 198, ay + ((by - ay) * k) / n - 50]);
    }
    this.letters = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ fog: false }), cubes.length);
    const m = new THREE.Object3D();
    cubes.forEach(([x, y], i) => { m.position.set(x, y, 0); m.scale.setScalar(4.4); m.updateMatrix(); this.letters.setMatrixAt(i, m.matrix); });
    this.letters.frustumCulled = false;
    this.letters.visible = false;
    this.roam.add(this.letters);

    // On his workbench, in memory: the old yellowed computer mouse he rebuilt into a vape, fired by
    // clicking the mouse button. His own code mentions it: "new Atomizer remote holder caqused old
    // mouse one totaly destroid by faling down". Here it is whole again, and now and then it clicks.
    const beige = new THREE.MeshBasicMaterial({ color: 0x8f8560, fog: false }), edge = new THREE.LineBasicMaterial({ color: 0xe9dfb4, fog: false });
    const part = (geometry, material, x, y, z, sx, sy, sz) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 28), edge)); // drawn by its edges, like everything here
      return mesh;
    };
    const box = new THREE.BoxGeometry(1, 1, 1), dome = new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), tube = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
    this.maus = new THREE.Group();
    this.maus.add(part(box, beige, 0, 3, 0, 20, 6, 34));                                    // the body
    this.maus.add(part(dome, beige, 0, 6, 5, 20, 12, 24));                                  // the palm rest
    this.mausTaste = part(box, new THREE.MeshBasicMaterial({ color: 0xa39a72, fog: false }), -5.2, 7.2, -10, 9.4, 2, 13); // left button: the one that fires it
    this.maus.add(this.mausTaste);
    this.maus.add(part(box, new THREE.MeshBasicMaterial({ color: 0xa39a72, fog: false }), 5.2, 7.2, -10, 9.4, 2, 13));  // right button
    this.maus.add(part(tube, new THREE.MeshBasicMaterial({ color: 0x70747c, fog: false }), 0, 15, 8, 5, 16, 5));         // the atomizer, standing out of its back
    this.maus.add(part(tube, new THREE.MeshBasicMaterial({ color: 0x15151a, fog: false }), 0, 25, 8, 3, 5, 3));          // mouthpiece
    const kabel = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[0, 3, -17], [-4, 2, -30], [10, 2, -46], [2, 2, -62], [-14, -8, -70]].map((p) => new THREE.Vector3(...p))), 24, 0.9, 6), beige);
    this.maus.add(kabel);
    this.maus.position.set(-272, -214, -118); // on the workbench
    this.maus.rotation.y = 0.5;
    this.maus.scale.setScalar(1.5);
    this.group.add(this.maus);
    this.dampf = new THREE.Points(
      new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(48 * 3), 3)),
      new THREE.PointsMaterial({ color: 0x6a6f78, size: 7, transparent: true, opacity: 0, depthWrite: false, fog: false }),
    );
    this.dampf.frustumCulled = false;
    this.group.add(this.dampf);
    this.mausIn = 6;
    this.zug = 0; // seconds since the last click

    // the kote board: in a sector made from one of his files, the file itself runs down a board
    this.kode = { file: null, lines: [], top: 0, redraw: 0, canvas: document.createElement("canvas") };
    this.kode.canvas.width = 1024;
    this.kode.canvas.height = 1344;
    this.kode.texture = new THREE.CanvasTexture(this.kode.canvas);
    this.kode.texture.colorSpace = THREE.SRGBColorSpace;
    this.kode.board = new THREE.Mesh(new THREE.PlaneGeometry(760, 1000), new THREE.MeshBasicMaterial({ map: this.kode.texture, fog: false }));
    this.kode.board.add(new THREE.Mesh(new THREE.PlaneGeometry(760, 1000), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false, side: THREE.BackSide })));
    this.kode.board.visible = false;
    this.group.add(this.kode.board);

    this.effect = {};        // seconds left of each running effect
    this.effectIn = rand(20, 40);
    this.meowIn = 4;
    this.optical = 0;

    this.museum = new Museum({ group: this.group, audio, stageEl: document.getElementById("stage"), hintEl: document.getElementById("hint"), wallEl: document.getElementById("wall") });

    // "Etwas zu meiner person": his own introduction from his homepage, in full and unedited,
    fetch("/marderchen/about.txt").then((res) => res.text()).then((about) => {
      const plaque = textSprite(1024, 1024, 1), { ctx } = plaque;
      ctx.fillStyle = "rgba(0, 0, 0, 0.82)";
      ctx.fillRect(0, 0, 1024, 1024);
      let y = 34;
      for (const [i, paragraph] of about.split("\n").entries()) {
        ctx.font = i === 0 ? "26px monospace" : "15px monospace";
        ctx.fillStyle = i === 0 ? "#00ff00" : "#ffb3ff";
        let line = "";
        for (const word of paragraph.split(" ")) {
          if (ctx.measureText(`${line} ${word}`).width > 990) { ctx.fillText(line, 16, y); y += 19; line = word; } else line = line ? `${line} ${word}` : word;
        }
        ctx.fillText(line, 16, y);
        y += i === 0 ? 34 : 24;
      }
      plaque.texture.needsUpdate = true;
      // a board that hangs in one place in the workshop, to the right of the clock, turned toward
      // where visitors come out of the ring. It does not turn to follow you.
      const board = new THREE.Mesh(new THREE.PlaneGeometry(560, 560), new THREE.MeshBasicMaterial({ map: plaque.texture, fog: false }));
      board.position.set(210 * UNIT, 40 * UNIT, -250 * UNIT);
      board.lookAt(0, 120, 0);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(560, 560), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false, side: THREE.BackSide }));
      board.add(back); // black from behind, so the text is never seen mirrored
      this.group.add(board);
    }).catch(() => {});

    // his MEOW in ASCII art, as he made it, hung high over the workshop
    fetch("/marderchen/meow_ascii.txt").then((res) => res.arrayBuffer()).then((data) => {
      const rows = new TextDecoder("latin1").decode(data).split("\n"), art = textSprite(2048, 1024, 900 * UNIT * 0.5);
      art.ctx.font = "8px monospace";
      art.ctx.fillStyle = "#ffff00";
      rows.forEach((row, i) => art.ctx.fillText(row, 4, 8 + i * 7.5));
      art.texture.needsUpdate = true;
      art.sprite.position.set(0, 330 * UNIT, 120 * UNIT);
      this.group.add(art.sprite);
    }).catch(() => {});

    fetch("/marderchen/kote.json").then((res) => res.json()).then((kote) => { this.kote = kote; }).catch(() => {});

    // "Chaos-generator>>" exactly as on his homepage: random characters marching along a line
    this.chaos = textSprite(1024, 40, 520 * UNIT * 0.5);
    this.chaos.sprite.position.set(0, 96 * UNIT, -330 * UNIT);
    this.chaosBuffer = Array(60).fill("-");
    this.chaosTimer = 0;
    this.group.add(this.chaos.sprite);
  }

  centre(realm, out) {
    return realm === REALM ? out.set(0, 0, 0) : out.fromArray(GATE_SECTOR).multiplyScalar(CELL);
  }

  // ---- the ring ----

  // Going through. This happens in the dark, in the middle of the hole, so nothing is seen to jump.
  travel(camera) {
    const { world } = this, entering = world.realm !== REALM;
    world.setRealm(entering ? REALM : "void");
    const centre = this.centre(world.realm, tmp);
    if (entering) {
      // you come out just above the ring in the middle of his workshop, slowed to a drift, facing the clock
      camera.position.set(centre.x, centre.y + CLEAR, centre.z);
      this.arrive(0, -0.04);
    } else {
      // and leaving, just below the ring over the hub, the way you came
      camera.position.set(centre.x, centre.y - CLEAR, centre.z);
      this.arrive(camera.rotation.y, camera.rotation.x);
    }
    this.spent = true; // it will not take you again until you have got clear of it
    this.veil = 1.3;
    this.audio.sting();
    this.audio.meow(0.6);
    this.audio.setChip(entering);
    // his homepage's music fades in as the dark lifts; leaving, it fades away
    this.audio.setTrack(entering);
    this.musikIn = 0;
    this.group.visible = entering;
    this.roam.visible = entering;
    if (this.mad) this.calm();
    if (!entering) world.G.uChan.value.fill(0.5); // the ring outside glows steadily
    this.inside = 0;
    for (const t of this.lineTimers) clearTimeout(t);
    this.textEl.classList.remove("show");
    if (entering) {
      // he is not waiting at the door. He is somewhere in here, busy; go and find him
      this.position.copy(this.station());
      this.pause = rand(0.5, 3);
      this.speakIn = 0;
      this.met = false;
    }
  }

  // ---- speech ----

  say(lines) {
    for (const t of this.lineTimers) clearTimeout(t);
    this.lineTimers = [];
    lines.forEach((line, i) => {
      this.lineTimers.push(setTimeout(() => {
        this.textEl.textContent = line;
        this.textEl.classList.add("show");
      }, i * 4800));
      this.lineTimers.push(setTimeout(() => this.textEl.classList.remove("show"), (i + 0.8) * 4800));
    });
    this.audio.meow(0.4); // he says it out loud too
    this.said = [...this.said, ...lines].slice(-16);
    this.store("marderchen.said", this.said);
  }

  async speak(event, near) {
    this.asking = true;
    let lines = null;
    if (!this.world.offline && performance.now() > (this.askAgain ?? 0)) {
      try {
        const res = await fetch("/api/marderchen", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ event, near, minutes: this.inside / 60, said: this.said }),
        });
        if (res.ok) ({ lines, effect: this.wanted } = await res.json());
        else this.askAgain = performance.now() + 10 * 60 * 1000; // Claude is not answering for him: his own words for the next ten minutes
      } catch { /* his own words will do */ }
    }
    this.asking = false;
    if (this.world.realm !== REALM) return;
    // he does something to the place as he speaks: what Claude chose, or his own whim
    this.doEffect(this.wanted && this.wanted !== "none" ? this.wanted : Math.random() < 0.6 ? EFFECTS[Math.floor(Math.random() * EFFECTS.length)] : null, this.lastCamera);
    this.wanted = null;
    if (!lines?.length) {
      const fresh = WORDS.filter((w) => !this.said.includes(w));
      const pool = fresh.length ? fresh : WORDS, short = this.kote.filter((k) => k.t.length < 70 && !this.said.includes(k.t)).map((k) => k.t);
      // without Claude he speaks only in sentences he really wrote
      lines = [Math.random() < 0.6 && short.length ? short[Math.floor(Math.random() * short.length)] : pool[Math.floor(Math.random() * pool.length)]];
    }
    this.say(lines);
  }

  // ---- living here ----

  // ---- what he does to the place ----

  burst(at, count, speed) {
    for (let i = 0; i < count; i++) {
      const s = this.spark[this.sparkNext = (this.sparkNext + 1) % this.spark.length];
      s.life = rand(1.4, 2.8);
      s.hue = Math.random() * 2405;
      s.v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed * rand(0.4, 1));
      this.sparks.geometry.attributes.position.setXYZ(this.sparkNext, at.x, at.y, at.z);
    }
  }

  doEffect(name, camera) {
    if (!EFFECTS.includes(name)) return;
    const { world, audio } = this;
    audio.meow(0.5);
    camera.getWorldDirection(forward);
    if (name === "rainbowpower") { this.effect.rainbowpower = 22; world.light = 1.8; }            // [MEOW] more rainbowpower!
    if (name === "ratemal") { this.effect.ratemal = 26; this.brainhack.dicht = 26; this.brainhack.ratemal(); } // a denser sequence
    if (name === "meowchor") {
      this.effect.meowchor = 12;
      this.cats.forEach((c, i) => setTimeout(() => audio.meow(0.35, (i % 5 - 2) / 2), i * 260));
    }
    if (name === "firework") this.effect.firework = 9;
    if (name === "optical") world.sky.setField(OPTICAL[this.optical = (this.optical + 1) % OPTICAL.length]);
    if (name === "starflakes") this.effect.starflakes = 24;
    if (name === "meowletters") {
      this.effect.meowletters = 26;
      this.letters.position.copy(camera.position).addScaledVector(forward, 420);
      this.letters.lookAt(camera.position);
      this.letters.scale.setScalar(1.6);
      this.letters.visible = true;
    }
    if (name === "lightsoff") { this.effect.lightsoff = 7; world.light = 0.05; }
  }

  runEffects(dt, camera) {
    const { effect, world } = this, done = (name) => effect[name] > 0 && (effect[name] -= dt) <= 0;
    if (done("rainbowpower")) world.light = 1;
    if (done("ratemal")) this.brainhack.dicht = 9;
    done("meowchor");
    if (effect.firework > 0 && Math.random() < dt * 2.2) {
      camera.getWorldDirection(forward);
      this.burst(tmp.copy(camera.position).addScaledVector(forward, rand(260, 620)).add(forward.set(rand(-300, 300), rand(-120, 260), rand(-300, 300))), 90, 190);
      this.audio.ping(rand(700, 1500), 0.05, 0.5);
    }
    done("firework");
    if (effect.starflakes > 0) {
      for (let i = 0; i < 3; i++) {
        const s = this.spark[this.sparkNext = (this.sparkNext + 1) % this.spark.length];
        s.life = 3; s.hue = Math.random() * 2405; s.v.set(rand(-12, 12), -rand(50, 110), rand(-12, 12));
        this.sparks.geometry.attributes.position.setXYZ(this.sparkNext, camera.position.x + rand(-500, 500), camera.position.y + rand(120, 320), camera.position.z + rand(-500, 500));
      }
    }
    done("starflakes");
    if (effect.meowletters > 0) {
      for (let i = 0; i < this.letters.count; i++) {
        const d = rainbowcalc(i * 14 + this.time * 520); // the rainbow runs along the lines, as in wuselline()
        this.letters.setColorAt(i, this.clock.colour.setRGB(d[0] / 400, d[1] / 400, d[2] / 400));
      }
      this.letters.instanceColor.needsUpdate = true;
    }
    if (done("meowletters")) this.letters.visible = false;
    if (done("lightsoff")) { world.light = 1; world.G.uLight.value = 3.2; this.audio.meow(0.6); }

    // the loose lights
    const pos = this.sparks.geometry.attributes.position, col = this.sparks.geometry.attributes.color;
    for (let i = 0; i < this.spark.length; i++) {
      const s = this.spark[i];
      if (s.life <= 0) { col.setXYZ(i, 0, 0, 0); continue; }
      s.life -= dt;
      pos.setXYZ(i, pos.getX(i) + s.v.x * dt, pos.getY(i) + s.v.y * dt, pos.getZ(i) + s.v.z * dt);
      const d = rainbowcalc(s.hue), fade = Math.min(1, s.life);
      col.setXYZ(i, (d[0] / 400) * fade, (d[1] / 400) * fade, (d[2] / 400) * fade);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  // somewhere he has business: his clock, his workbench, the meowmeter wall, the kote wall, the matrix
  station() {
    const spots = [
      this.clock.mesh.position, this.meowmeter.mesh.position,
      tmp.set(-150 * UNIT, -100 * UNIT, -60 * UNIT), forward.set(-300 * UNIT, 20 * UNIT, -200 * UNIT),
    ];
    const spot = spots[Math.floor(Math.random() * (spots.length + 1))];
    const out = new THREE.Vector3(rand(-240, 240), rand(-90, 60), rand(-60, 200));
    return spot ? out.add(spot) : out.set(rand(-420, 420), -230 * UNIT * 0.5 + rand(0, 120), rand(-420, 420)); // or out on the matrix
  }

  wusel(dt, camera) {
    const p = this.position;
    if (this.pause > 0) {
      // not still even when he stops: fiddling with something
      this.pause -= dt;
      p.x += Math.sin(this.time * 31) * 14 * dt;
      p.y += Math.cos(this.time * 23) * 9 * dt;
      if (this.pause <= 0) {
        const roll = Math.random(), home = camera.position.length() < CELL * 0.75;
        if (!home && roll < 0.75) {
          // the visitor has wandered off into the LEDs or the museum: he has things to look at there too
          this.target.copy(camera.position).add(tmp.set(rand(-520, 520), rand(-260, 260), rand(-520, 520)));
        } else if (roll < 0.14) {
          // now and then he scurries right past the visitor
          camera.getWorldDirection(forward);
          this.target.copy(camera.position).addScaledVector(forward, rand(140, 320));
          this.target.x += rand(-200, 200); this.target.y += rand(-90, 110); this.target.z += rand(-200, 200);
        } else if (roll < 0.86) {
          this.target.copy(this.station());
        } else {
          this.target.copy(p).add(tmp.set(rand(-500, 500), rand(-200, 200), rand(-500, 500)));
        }
        this.speed = rand(260, 620);
      }
      return;
    }
    tmp.copy(this.target).sub(p);
    const left = tmp.length();
    if (left < 12) {
      this.pause = rand(0.5, 3.2);
      return;
    }
    tmp.normalize();
    camera.getWorldDirection(forward);
    const sideways = tmp.dot(forward.cross(camera.up).normalize());
    if (Math.abs(sideways) > 0.15) this.facing = Math.sign(sideways);
    // a scurry, not a glide: bursts, with a hop in them
    const burst = 0.55 + 0.45 * Math.sin(this.time * 9) ** 2;
    p.addScaledVector(tmp, Math.min(left, this.speed * burst * dt));
    p.y += Math.sin(this.time * 17) * 26 * dt;
  }

  // him scurrying, his cats, his sparkle: wherever he is
  alive(dt, camera) {
    this.wusel(dt, camera);
    const frame = Math.floor(this.time * 5.5) % AVATAR_USED;
    this.avatar.repeat.x = this.facing / AVATAR_FRAMES;
    this.avatar.offset.x = (frame + (this.facing < 0 ? 1 : 0)) / AVATAR_FRAMES;

    const gather = this.effect.meowchor > 0 ? 1.4 : 6; // in a meow chorus every cat comes to the visitor
    for (const c of this.cats) {
      const { cat, map, phase, lag, radius, stray } = c, a = this.time * (stray ? 0.25 : 0.9) + phase;
      // his own cats circle him; the strays drift in a wide loose ring around whoever is visiting
      tmp.copy(stray ? camera.position : this.position)
        .add(forward.set(Math.cos(a) * radius * (stray ? gather : 1), Math.sin(a * 1.7) * (stray ? gather * 20 : 14) - 18, Math.sin(a) * radius * (stray ? gather : 1)));
      cat.position.lerp(tmp, Math.min(1, dt * lag));
      map.offset.x = (Math.floor(this.time * 14 + phase * 3) % CAT_FRAMES) / CAT_FRAMES;
      // MEOW
      if ((c.meowIn -= dt) <= 0) {
        c.meowIn = 7 + Math.random() * 22;
        const off = tmp.copy(cat.position).sub(camera.position), far = off.length();
        if (far < 520) this.audio.meow(0.35 * (1 - far / 520) + 0.05, off.normalize().dot(forward.set(1, 0, 0).applyQuaternion(camera.quaternion)));
      }
    }

    // sparkles: drop one where he is, let the old ones fade
    const pos = this.sparkle.geometry.attributes.position, col = this.sparkle.geometry.attributes.color;
    if ((this.sparkleTimer -= dt) <= 0) {
      this.sparkleTimer = 0.035;
      const i = this.sparkleNext = (this.sparkleNext + 1) % pos.count;
      pos.setXYZ(i, this.position.x + rand(-9, 9), this.position.y + rand(-9, 9), this.position.z + rand(-9, 9));
      this.sparkleAge[i] = 0;
      pos.needsUpdate = true;
    }
    const c = this.clock.colour;
    for (let i = 0; i < pos.count; i++) {
      const life = Math.max(0, 1 - (this.sparkleAge[i] += dt) / 2.6);
      c.setHSL((i * 0.045 + this.time * 0.3) % 1, 1, 0.5 * life);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  // ---- out in the void ----
  // Rarely, without warning, he turns up outside his dimension and takes the void over: for half a
  // minute or so it is his, and he does with it whatever comes into his head, a new thing every few
  // seconds. It can be lovely, it can be cute, it can be frightening. Then he is gone and the void
  // is as it was.

  goMad(camera) {
    // (called by hand from the console it says what it did, so that nothing happening has a reason)
    if (performance.now() - (this.lastFrame ?? 0) > 1000) return "the game is not running: click 'materialize' first, and keep the tab in front";
    if (this.inVoid && this.world.realm === REALM) return "not in here: this is the one place he does not come. surge out (shift) first";
    if (this.mad) return `he is already out, for another ${Math.round(this.mad)}s`;
    if (this.world.realm !== REALM) return "only in his dimension: go through his door first";
    const home = true; // in his own dimension it can be set off by hand; by itself it only happens in the void
    this.mad = rand(35, 70);
    this.willIn = 0;
    this.roam.visible = true;
    this.typer.room.visible = false;
    this.letters.visible = false;
    this.position.copy(camera.position).addScaledVector(camera.getWorldDirection(forward), 260);
    this.pause = 1.2;
    if (!home) this.audio.setChip(true);
    this.audio.meow(0.8);
    this.say(["MEOW!"]);
    this.world.G.uLight.value = 3; // he arrives with a flare: there is no missing it
    return `he is out for ${Math.round(this.mad)}s, ${home ? "at home" : "in the void"}`;
  }

  calm() {
    const { world } = this;
    this.mad = 0;
    world.light = 1;
    world.fogBoost = 1;
    world.G.uMad.value = 0;
    this.roam.visible = world.realm === REALM;
    this.typer.room.visible = false;
    this.letters.visible = false;
    this.body.scale.setScalar(56 * UNIT * 0.5);
    this.effect = {};
    this.spin = 0;
    this.loom = 0;
    this.maze = 0;
    if (world.realm !== REALM) {
      this.audio.setChip(false);
      if (world.currentSpec) world.sky.setField(world.currentSpec.fieldGlsl); // the sector's own sky comes back
    }
    this.textEl.classList.remove("show");
  }

  will(camera) {
    const { world, audio } = this, quote = () => [(this.kote.length && Math.random() < 0.5 ? this.kote[Math.floor(Math.random() * this.kote.length)].t : WORDS[Math.floor(Math.random() * WORDS.length)]).slice(0, 80)];
    world.light = 1; world.fogBoost = 1; this.spin = 0; this.loom = 0;
    const wills = {
      // cute: every cat comes, MEOW goes up in lights, starflakes fall
      cute: () => { this.doEffect("meowchor", camera); this.doEffect("meowletters", camera); this.doEffect("starflakes", camera); world.light = 1.3; },
      // madness: everything at once, brighter, faster, and the world turns over
      madness: () => { this.doEffect("rainbowpower", camera); this.doEffect("ratemal", camera); this.doEffect("firework", camera); this.spin = rand(-1.4, 1.4); },
      // nice: light, his own words, a chime
      nice: () => { world.light = 1.6; audio.arrive(); this.doEffect("optical", camera); },
      // the lights go, the fog closes, and he is right in front of you, enormous, looking
      looming: () => { world.light = 0.03; world.fogBoost = 2.6; this.loom = rand(4, 7); audio.meow(0.9, 0, 0.42); },
      // his chaostyper closes round you where you stand: black walls, the sentence writing itself
      typer: () => { world.light = 0.15; this.maze = rand(8, 13); this.typer.room.position.copy(camera.position); this.typer.room.visible = true; },
      // nothing at all: dark and silent, and then a single MEOW behind you
      nothing: () => { world.light = 0.02; audio.hush(4); setTimeout(() => this.mad && audio.meow(0.9, rand(-1, 1), 0.7), 3200); },
    };
    const name = Object.keys(wills)[Math.floor(Math.random() * 6)];
    wills[name]();
    if (name !== "nothing") this.say(quote());
  }

  wild(dt, camera) {
    const { world } = this;
    if (!this.mad) return; // out in the void he never does this: only at home
    world.G.uMad.value += (1 - world.G.uMad.value) * Math.min(1, dt * 1.5); // everything in the void takes his colours
    this.alive(dt, camera);
    this.runEffects(dt, camera);
    this.brainhack.zeitreise(this.audio.chipClock(), dt);
    this.rage(dt, camera);
  }

  // one frame of it, in the void or (set off by hand) at home
  rage(dt, camera) {
    if ((this.mad -= dt) <= 0) return this.calm();
    if ((this.willIn -= dt) <= 0) {
      this.willIn = rand(5, 9);
      this.will(camera);
    }
    if ((this.meowIn -= dt) <= 0) { this.meowIn = rand(0.8, 3); this.audio.meow(rand(0.2, 0.6), rand(-1, 1), rand(0.7, 1.4)); }
    this.roll += (this.spin ?? 0) * dt;
    if (this.loom > 0) {
      // close enough to fill the view, wherever you turn
      this.loom -= dt;
      this.position.copy(camera.position).addScaledVector(camera.getWorldDirection(forward), 130);
      this.body.scale.setScalar(56 * UNIT * 0.5 * 5);
      this.pause = 1;
      if (this.loom <= 0) this.body.scale.setScalar(56 * UNIT * 0.5);
    }
    if (this.maze > 0) {
      this.typer.tick(dt);
      if ((this.maze -= dt) <= 0) this.typer.room.visible = false;
    }
  }

  update(dt, camera, surge = false) {
    const { world } = this;
    this.time += dt;
    this.lastFrame = performance.now();

    // in another dimension altogether (the zone): nothing of his door, nor of him, is there
    if (world.realm !== REALM && world.realm !== "void") {
      this.hole.visible = this.vortex.visible = false;
      this.pull.set(0, 0, 0);
      this.roll *= Math.exp(-dt * 2.5);
      this.veil = Math.max(0, this.veil - dt / 1.9);
      this.fade = Math.min(1, this.veil);
      this.museum.update(dt, camera, false);
      return;
    }

    // ---- the door: a black hole in a ring, in whichever world you are in ----
    const centre = this.vortex.position.copy(this.centre(world.realm, tmp));
    const nearDoor = centre.distanceTo(camera.position);
    this.hole.position.copy(centre);
    this.hole.visible = world.realm === REALM || nearDoor < 5000;
    // the turning light in it is faint, and only shows from close by
    this.vortex.visible = nearDoor < 420;
    if (this.vortex.visible) {
      this.vortex.rotation.y -= dt * 1.4;
      for (let i = 0; i < this.vortexT.length; i++) {
        const d = rainbowcalc(this.vortexT[i] * 1500 + this.time * 900), fade = 0.3 * (1 - this.vortexT[i]) * Math.min(1, (420 - nearDoor) / 200);
        this.vortex.setColorAt(i, this.clock.colour.setRGB((d[0] / 400) * fade, (d[1] / 400) * fade, (d[2] / 400) * fade));
      }
      this.vortex.instanceColor.needsUpdate = true;
    }
    if (nearDoor > HOLE * 2.8) this.spent = false;
    this.pull.set(0, 0, 0);
    let suck = 0;
    const dx = camera.position.x - centre.x, dy = camera.position.y - centre.y, dz = camera.position.z - centre.z, radial = Math.hypot(dx, dz) || 1;
    // The pull starts a long way out, above and below the ring, in a cone that widens with distance.
    // Far off it is only a drift toward the axis; it grows steadily the closer you come.
    const REACH = 900, wide = GATE_RADIUS + Math.abs(dy) * 0.55;
    if (!this.spent && Math.abs(dy) < REACH && radial < wide) {
      suck = (1 - Math.abs(dy) / REACH) ** 1.5 * (1 - radial / wide);
      this.pull.set((-dx / radial) * 190 - (dz / radial) * 70, -Math.sign(dy) * 260, (-dz / radial) * 190 + (dx / radial) * 70).multiplyScalar(suck);
    }
    this.roll += suck ** 2 * dt * 1.6; // the turning only comes on near the end
    this.roll -= Math.round(this.roll / (Math.PI * 2)) * Math.PI * 2;
    if (!suck) this.roll *= Math.exp(-dt * 2.5);
    // The dark. It gathers smoothly as you close on the hole and is complete before you reach the
    // middle; you pass through while nothing can be seen; on the far side it lifts as slowly.
    const closing = this.spent ? 0 : 1 - THREE.MathUtils.smoothstep(nearDoor, HOLE * 1.0, HOLE * 2.6);
    this.veil = Math.max(0, this.veil - dt / 1.9);
    this.fade = Math.max(closing, Math.min(1, this.veil)); // main.js draws the dark: either door may be closing
    if (!this.spent && nearDoor < HOLE * 0.7) return this.travel(camera);

    this.museum.update(dt, camera, world.realm === REALM && world.currentSpec?.name === "marderchen's museum");
    if (world.realm !== REALM) return this.wild(dt, camera);
    this.inside += dt;
    this.alive(dt, camera);

    // "realsound by relai clock": every second is a relay switching
    if (this.clock.update(this.time) && camera.position.distanceTo(this.clock.mesh.position) < 700) this.audio.relay(0.18);

    this.lastCamera = camera;
    // the void inside his dimension: in there nothing of his reaches. No music, no MEOW, no cats, not him.
    const inVoid = this.typer.update(dt, camera, surge);
    if (inVoid !== this.inVoid) {
      this.inVoid = inVoid;
      this.audio.setChip(!inVoid);
      if (this.musikIn <= 0) this.audio.setTrack(!inVoid);
      this.audio.silentMeow = inVoid;
      for (const thing of [this.body, this.sparkle, this.sparks, this.letters, this.dampf, ...this.cats.map((c) => c.cat)]) thing.visible = !inVoid && thing !== this.letters;
      this.textEl.classList.remove("show");
    }
    // it does not say how to leave until you have been in there a while
    this.museum.hintEl.textContent = inVoid && this.typer.inside > 30 ? "shift" : this.museum.hintEl.textContent === "shift" ? "" : this.museum.hintEl.textContent;
    if (inVoid) return;
    if (this.musikIn > 0 && (this.musikIn -= dt) <= 0) this.audio.setTrack(true);
    this.runEffects(dt, camera);
    if (this.mad) this.rage(dt, camera);
    // at home, now and then and without warning, he takes the place over: looked at every twenty
    // seconds, a low chance, once in a long while
    else if ((this.madCheck = (this.madCheck ?? 20) - dt) <= 0) {
      this.madCheck = 20;
      if (Math.random() < 0.02) this.goMad(camera);
    }
    // left alone he still fiddles with the place, and he meows. A lot.
    if ((this.effectIn -= dt) <= 0) {
      this.effectIn = rand(30, 65);
      if (this.position.distanceTo(camera.position) < 1500) this.doEffect(EFFECTS[Math.floor(Math.random() * EFFECTS.length)], camera);
    }
    if ((this.meowIn -= dt) <= 0) {
      this.meowIn = rand(3, 9);
      const off = tmp.copy(this.position).sub(camera.position), far = off.length();
      if (far < 900) this.audio.meow(0.5 * (1 - far / 900) + 0.06, off.normalize().dot(forward.set(1, 0, 0).applyQuaternion(camera.quaternion)));
    }
    // his kote, running down its board in the sector that is made from it
    const kode = this.kode, file = world.currentSpec?.file ?? null;
    if (file !== kode.file) {
      kode.file = file;
      kode.lines = [];
      kode.board.visible = false;
      if (file) {
        const [sx, sy, sz] = world.currentKey.slice(2).split(",").map(Number);
        kode.board.position.set(sx * CELL + 780, sy * CELL + 40, sz * CELL);
        kode.board.rotation.y = -Math.PI / 2; // facing the middle of the sector
        fetch(`/museum/src/www.marderchen.lima-city.de/wuselcode/${encodeURIComponent(file)}`).then((res) => (res.ok ? res.arrayBuffer() : null)).then((data) => {
          if (!data || kode.file !== file) return;
          kode.lines = new TextDecoder("latin1").decode(data).replace(/\t/g, "  ").split(/\r?\n/);
          kode.top = 0;
          kode.board.visible = true;
        }).catch(() => {});
      }
    }
    if (kode.board.visible && (kode.redraw -= dt) <= 0) {
      kode.redraw = 0.1;
      kode.top = (kode.top + 0.28) % Math.max(1, kode.lines.length); // a few lines a second, round and round
      const ctx = kode.canvas.getContext("2d"), first = Math.floor(kode.top);
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, 1024, 1344);
      ctx.font = "22px monospace";
      ctx.fillStyle = "#ff00ff";
      ctx.fillText(kode.file, 14, 30, 996);
      ctx.font = "15px monospace";
      for (let row = 0; row < 70; row++) {
        const line = kode.lines[(first + row) % kode.lines.length] ?? "";
        ctx.fillStyle = /^\s*(\/\/|\*|\/\*)/.test(line) ? "#00ff00" : "#8fb8ff"; // his comments in green, as in his editor colours
        ctx.fillText(line.slice(0, 118), 14, 62 + row * 18);
      }
      kode.texture.needsUpdate = true;
    }

    // the mouse on the desk: click, and a breath of vapour
    this.zug += dt;
    if ((this.mausIn -= dt) <= 0) {
      this.mausIn = rand(14, 32);
      this.zug = 0;
      if (camera.position.distanceTo(this.maus.position) < 600) this.audio.relay(0.08);
      const at = this.dampf.geometry.attributes.position, top = tmp.set(0, 28, 8).applyMatrix4(this.maus.matrixWorld);
      for (let i = 0; i < at.count; i++) at.setXYZ(i, top.x + rand(-2, 2), top.y + rand(0, 6), top.z + rand(-2, 2));
    }
    this.mausTaste.position.y = this.zug < 0.3 ? 6.4 : 7.2;
    if (this.zug < 6) {
      const at = this.dampf.geometry.attributes.position;
      for (let i = 0; i < at.count; i++) at.setXYZ(i, at.getX(i) + Math.sin(i * 1.7 + this.time) * 5 * dt, at.getY(i) + (9 + (i % 7) * 2.5) * dt, at.getZ(i) + Math.cos(i * 2.3 + this.time) * 5 * dt);
      at.needsUpdate = true;
    }
    this.dampf.material.opacity = 0.22 * Math.max(0, Math.min(1, this.zug * 3, (6 - this.zug) / 4));

    this.brainhack.zeitreise(this.audio.chipClock(), dt);
    this.meowmeter.update(dt, this.time);

    for (const line of this.koteLines) {
      if ((line.next -= dt) > 0 || !this.kote.length) continue;
      line.next = rand(7, 11);
      const kote = this.kote[Math.floor(Math.random() * this.kote.length)], { ctx, texture } = line;
      ctx.clearRect(0, 0, 1024, 64);
      ctx.font = "24px monospace";
      ctx.fillStyle = "#00ff00";
      ctx.fillText(`//${kote.t}`, 6, 26, 1012);
      ctx.font = "13px monospace";
      ctx.fillStyle = "#00aaff";
      if (kote.f) ctx.fillText(kote.f, 6, 50, 1012);
      texture.needsUpdate = true;
    }

    if ((this.chaosTimer -= dt) <= 0) {
      this.chaosTimer = 0.05;
      const mix = "1234567890abcdefghijklmnopqrstuvwxyz";
      this.chaosBuffer.pop();
      // his generator is pure chaos; here a MEOW slips through it now and then
      this.chaosWord = this.chaosWord?.length ? this.chaosWord : Math.random() < 0.03 ? [..."]WOEM["] : null;
      this.chaosBuffer.unshift(this.chaosWord ? this.chaosWord.pop() : mix[Math.floor(Math.random() * mix.length)]);
      const { ctx, texture } = this.chaos;
      ctx.clearRect(0, 0, 1024, 40);
      ctx.font = "24px monospace";
      ctx.fillStyle = "#00ff00";
      ctx.fillText(`Chaos-generator>>${this.chaosBuffer.join("")}`, 6, 28);
      texture.needsUpdate = true;
    }

    // when he has something to say
    const distance = this.position.distanceTo(camera.position);
    this.speakIn -= dt;
    // he only talks when the visitor is near enough to hear: he does not greet at the door
    if (!this.asking && this.speakIn <= 0 && distance < 340) {
      const nearClock = camera.position.distanceTo(this.clock.mesh.position) < 420;
      const event = !this.met ? "the traveller has just found him; he was busy with something and looks up"
        : distance < 170 ? "the traveller has come right up to him" : "he scurries past the traveller, busy, and says something over his shoulder";
      this.met = true;
      this.speakIn = rand(22, 40);
      const piece = this.museum.focus?.item;
      this.speak(event, piece ? `his museum, in front of his ${piece.kind} "${piece.title}"` : nearClock ? "his 0603 LED clock, showing the real time" : world.currentSpec?.name ?? "the matrix");
    }
  }
}
