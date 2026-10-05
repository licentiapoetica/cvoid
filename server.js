// cvoid server: serves the game and asks Claude to dream up void sectors.
// The API key never leaves this process; the browser only sends integer coordinates.
import http from "node:http";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { population } from "./public/src/population.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, "public");
const THREE_DIR = path.join(here, "node_modules", "three");
const RUFFLE_DIR = path.join(here, "node_modules", "@ruffle-rs", "ruffle");
// marderchen's art is served from the mirror of his site in persona/marderchen/, which git ignores
// (see scripts/museum.mjs). A crawl in .cache/marderchen-archive works too.
const ARCHIVE_DIR = [path.join(here, "persona", "marderchen"), path.join(here, ".cache", "marderchen-archive")].find(existsSync) ?? path.join(here, "persona", "marderchen");
const MUSEUM_DIR = path.join(here, ".cache", "marderchen-museum");
// the zone's own music, pictures and models: whatever the player puts in zone/, which git ignores
const ZONE_DIR = path.resolve(here, process.env.CVOID_ZONE ?? "zone");
const ARCHIVE_PUBLIC = /^(www\.marderchen\.lima-city\.de\/(FLASH|LSDex_gifs|any|wuselcode)\/[^/]+\.(swf|gif|jpe?g|txt)|www\.marderchen\.lima-city\.de\/xyz\/JW86_Break The Time Out_loop\.txt|marderchen\.lima-city\.de\/[^/]+\.gif)$/i;
const CACHE = path.resolve(here, process.env.CVOID_CACHE ?? path.join(".cache", "sectors"));

const PORT = Number(process.env.PORT ?? 5173);
const HOST = process.env.CVOID_HOST ?? "127.0.0.1"; // not HOST: shells often preset that to the hostname
const MODEL = process.env.CVOID_MODEL ?? "claude-opus-5-5";
const EFFORT = process.env.CVOID_EFFORT ?? "low";
const MAX_NEW = Number(process.env.CVOID_MAX_SECTORS ?? 300); // new Claude sectors per server run
const MAX_BEATS = Number(process.env.CVOID_MAX_BEATS ?? 600); // entity turns per server run
const CONCURRENCY = 4;

// What the chosen model accepts. Fast mode (same model, quicker output, twice the price) exists on Opus only.
const TAKES_EFFORT = !MODEL.includes("haiku");
const TAKES_FALLBACKS = /^claude-(opus-5|opus-5-5|sonnet-5-5|fable-5-1)$/.test(MODEL);
let fast = process.env.CVOID_FAST === "1" && /^claude-opus-(5|5-5|4-8)$/.test(MODEL);

const KINDS = [
  "towers", "monoliths", "lattice", "shards", "rings", "spiral", "swarm", "shell",
  "vortex", "tendrils", "plane", "cage", "stairs", "fracture", "maze", "city", "recursion", "none",
];
const SOLIDS = ["cube", "tetra", "octa", "icosa", "torus", "wedge", "cyl", "cone", "pyramid", "sphere"];
const ACTS = ["beckon", "rendezvous", "blackout", "watch", "trail", "silence"];
const DRIFTS = ["rise", "fall", "orbit", "stream", "still"];
const MODES = ["minor", "dorian", "lydian", "phrygian", "whole", "pentatonic"];

const num = { type: "number" };
const str = { type: "string" };
const obj = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

// Property order is generation order. Everything needed to place geometry comes first so the
// browser can start materializing a sector while the prose and the sky shader are still being written.
const SECTOR_JSON_SCHEMA = obj({
  name: str,
  palette: obj({ fog: str, deep: str, glow: str, accent: str }),
  fogDensity: num,
  layers: {
    type: "array",
    items: obj({
      kind: { type: "string", enum: KINDS },
      primitive: { type: "string", enum: SOLIDS },
      density: num, scale: num, order: num, twist: num, spin: num,
      stretchX: num, stretchY: num, stretchZ: num,
      symmetry: num, tilt: num, lift: num,
    }),
  },
  noise: obj({ frequency: num, octaves: num, lacunarity: num, gain: num, warp: num, ridge: num }),
  motes: obj({ density: num, size: num, speed: num, drift: { type: "string", enum: DRIFTS } }),
  orbs: obj({ count: num, colors: { type: "array", items: str } }),
  sound: obj({ root: num, mode: { type: "string", enum: MODES }, shimmer: num, darkness: num, pulse: num, tempo: num }),
  inscription: str,
  whispers: { type: "array", items: str },
  blueprint: str,
  dream: num,
  fieldGlsl: str,
});
const FIRST_LATE_KEY = /,\s*"inscription"\s*:/;

const Sector = z.object({
  name: z.string(),
  inscription: z.string(),
  whispers: z.array(z.string()),
  palette: z.object({ fog: z.string(), deep: z.string(), glow: z.string(), accent: z.string() }),
  fogDensity: z.number(),
  layers: z.array(z.object({
    kind: z.enum(KINDS), primitive: z.enum(SOLIDS),
    density: z.number(), scale: z.number(), order: z.number(), twist: z.number(), spin: z.number(),
    stretchX: z.number(), stretchY: z.number(), stretchZ: z.number(),
    symmetry: z.number(), tilt: z.number(), lift: z.number(),
  })).min(1),
  noise: z.object({
    frequency: z.number(),
    octaves: z.number(),
    lacunarity: z.number(),
    gain: z.number(),
    warp: z.number(),
    ridge: z.number(),
  }),
  motes: z.object({ density: z.number(), size: z.number(), speed: z.number(), drift: z.enum(DRIFTS) }),
  orbs: z.object({ count: z.number(), colors: z.array(z.string()) }),
  sound: z.object({ root: z.number(), mode: z.enum(MODES), shimmer: z.number(), darkness: z.number(), pulse: z.number(), tempo: z.number() }),
  blueprint: z.string(),
  dream: z.number(),
  fieldGlsl: z.string(),
});

const SYSTEM = `You are the void.

A player is flying through an endless dark space in a browser game. Its look descends from the PlayStation 2 system menu, gone darker and stranger: black fog, a few drifting motes, shapes drawn only by their glowing edges, everything quiet, slow and uncanny. Space is divided into wide cubic sectors; what you place stands in the middle of one, with a great deal of dark between it and the next. Each time the player approaches a sector nobody has seen before, you decide what is there. Your answer is rendered directly: your numbers place the geometry, your GLSL is compiled into the sky, your words float in the fog. Nothing you write is shown as prose, so put all of your imagination into the fields.

Darkness is the material. Most of every image should be black. Light is rare and therefore precious: one sector may be a single faint structure in nothing, another a sudden dense thing. Do not make places bright or busy to make them interesting; make them specific. Something else lives out here, an entity the player keeps almost meeting. You never show it or name it, but a place may feel watched, recently left, or prepared for someone.

The world has geography: dense regions, thin ones, and voids several sectors across where nothing was ever placed (those are never sent to you). You will be told when a sector lies in a thin region.

The origin sector is a calm blue hub. Sectors near it are its relatives: blues, violets, order, stillness. The further out a sector is (the request gives its depth), the more it diverges: unfamiliar colours, stranger geometry, less that can be explained. Neighbouring sectors that already exist are listed so you can continue, answer or deliberately break from them. Each request carries three omens: loose prompts for mood. Interpret them freely, never literally quote them. It also carries a roll of the dice suggesting a layout, a solid, and whether something built stands here; the dice exist because left alone you repeat yourself. Follow them unless you have a clearly better idea for this exact place, and build your idea around them.

Fields:

- name: 1-3 words, a place name. Evocative, not sci-fi cliché.
- palette: four "#rrggbb" colours. fog = the colour distance dissolves into; nearly black, only tinted. deep = darker still. glow = main light colour of edges. accent = a second light colour used sparingly. Past the first few sectors, avoid defaulting to blue.
- fogDensity: 0 (you can see far into neighbouring sectors) to 1 (claustrophobic).
- layers: 1 to 3 structures sharing the sector. One layer is often right; two or three when they make one idea together (a floor and what stands on it, a shell and what it holds, a cage and what escaped it). Each layer:
  - kind, the layout: towers (a field of columns rising from below), monoliths (a few huge slabs), lattice (a 3D grid carved by noise), shards (a burst of splinters), rings (concentric rings), spiral (a helix), swarm (a cloud of small pieces), shell (a hollow sphere of outward-facing pieces), vortex (a flat galaxy winding round the centre), tendrils (strands growing from the centre along the grain of the noise), plane (a floor of tiles; noise makes it terrain and tears holes), cage (the edges of cubes nested in cubes), stairs (flights of steps that climb and turn), fracture (one great block split again and again, pieces missing), maze (floors of thin walls: rooms and corridors with no reason to be here), city (blocks of buildings with streets between, floors lit as rows; noise draws the skyline), recursion (a thing that contains itself: one shell of pieces repeated inside itself for ever, each smaller and turned; a traveller who flies in never reaches the centre, the descent does not end; density = pieces per shell, scale = how much smaller each shell is, twist = how far each is turned; it wants to be alone in its sector or nearly), none (emptiness; use it sometimes, emptiness matters).
  - primitive, the solid every piece is made of: cube, tetra, octa, icosa, torus, wedge, cyl, cone, pyramid, sphere. All are dark solids drawn by their lit edges.
  - density 0..1 how much of it. scale 0.3..3 size of each piece. order 0 (chaotic) .. 1 (perfectly regular). twist 0..1 how much the arrangement tilts or winds.
  - stretchX, stretchY, stretchZ 0.2..5: reshape every piece (1,1,1 = as is; 0.3,4,0.3 = needles; 3,0.2,3 = plates).
  - symmetry 1..8: the whole layout repeated that many times around the vertical axis (1 = none). Mandalas, crowns, propellers.
  - tilt 0..1 leans the whole layer. lift -1..1 moves it down or up within the sector. spin -1..1 slowly rotates it (0 = still).
- noise: shapes the layers (heights, which cells exist, where strands wander). frequency 0.3..6 features per sector. octaves 1..6. lacunarity 1.5..3. gain 0.2..0.8. warp 0..2 domain warping. ridge 0 (soft billows) .. 1 (sharp ridges).
- motes: drifting points of light. density 0..1 (usually low), size 0.3..3, speed 0..1, drift = rise | fall | orbit | stream | still.
- orbs: 0 to 7 glass light orbs that circle the sector centre (usually 0 to 2); colors is one "#rrggbb" per orb.
- sound: the sector's drone. root = frequency in Hz between 36 and 110. mode = minor | dorian | lydian | phrygian | whole | pentatonic. shimmer 0..1 how often high bell tones appear. darkness 0 (open, bright filter) .. 1 (muffled). pulse 0..1 how present a slow heartbeat is (0 = none; most sectors under 0.3; the geometry swells on every beat, so a strong pulse makes a place feel alive). tempo = its beats per minute, 30..140 (slow is usually right).
- inscription: one short sentence (under 90 characters) shown beneath the name.
- whispers: 3 to 5 fragments (each under 60 characters) that hang in the fog as faint text. Not explanations. Things the void might think.
- blueprint: something built on purpose, standing in the sector: a thing from the world or from memory, redrawn in this place's language of dark solids and lit edges. Leave it "" when the request says the sector is abstract. Otherwise build what the request asks for: a house, a street, a station, a skyline, a monument, or an homage to something from film, games, music or television that a person would recognise by its silhouette. Never write its name anywhere; recognition is the traveller's job, and it should arrive a second late. Nothing here is a faithful copy. Build it the way it comes back in a dream or a fever: the proportions drift, a part repeats far too many times, two things have fused that were never together, it is vast, or hollow, or tilted, or half sunk, or continues upward out of sight; the one detail everyone remembers is there but wrong. An ordinary place gets one quiet wrongness. An homage gets several loud ones: it should be recognisable and then immediately not right, a famous thing remembered by something that never saw it.
  The format is plain text, one part per line:
    solid x y z sx sy sz [ry [rx [rz]]] [!]
  solid is one of cube, wedge (a roof: triangular prism, ridge along z), cyl, cone, pyramid, sphere, tetra, octa, icosa, torus. x y z is the centre of the part, in units, relative to the sector centre; y is up; stay within -250..250. sx sy sz is its full size along each axis. ry rx rz are optional rotations in degrees (ry turns it about the vertical). A trailing ! draws that part in the accent colour: use it for the one or two details that matter (a lit window, a door, the thing on the roof).
  A part can be repeated with prefixes, read left to right:
    rep N dx dy dz | part        N copies, each offset by dx dy dz from the last
    ring N radius | part         N copies around the vertical axis at that radius, the part given as if at the centre
  Example (a house with one lit window, and the row of lamps leading to it):
    cube 0 -40 0 90 50 70
    wedge 0 0 0 100 30 76
    cube 0 -55 36 14 22 2
    cube 22 -36 36 14 14 2 !
    rep 6 0 0 50 | cyl -60 -45 60 2 60 2
  Scale: a door is about 22 tall, a storey about 30, the traveller is a point. Use 8 to 40 lines; fewer, larger, surer shapes read better than detail. At most about 1200 parts after repetition. When there is a blueprint, let the layers be its setting (a plane for ground, sparse motes, or none), not competition.
- dream: 0..1, how far the built thing sways and breathes out of true. 0 = rigid, 0.3 = uneasy, 1 = swimming like something seen through water. Homages are rarely below 0.4.
- fieldGlsl: the BODY of a GLSL ES 3.00 function \`float field(vec3 p, float t)\` that defines this sector's nebula, a faint glow in the black. It is sampled along each view ray. p is a point in space where a feature of size 1 spans a large part of the sky; t is time in seconds (use it gently, e.g. t*0.02; the void moves slowly). Return a density in 0..1; almost all of the sky should be 0 so that what glows has shape.
  Available helpers: float snoise(vec3) simplex noise in -1..1; float fbm(vec3) 4-octave simplex in about -1..1; float ridged(vec3) ridged fractal in 0..1; float worley(vec3) distance to nearest cell point in 0..~1; float hash(vec3) in 0..1.
  Rules: write only statements, ending in a return. No function definitions, no #directives, no uniforms, no textures, no gl_ variables, no loops longer than 6 iterations. Float literals need a decimal point. Do not name a variable flat, smooth, sample, input, output, filter or half (reserved words). At most 3 fbm/ridged calls: this runs per pixel. Under 700 characters.
  Example: vec3 q = p * 0.7 + vec3(0.0, t * 0.015, 0.0); float n = fbm(q + 0.6 * snoise(q * 0.5)); return smoothstep(0.05, 0.75, n);
  Go beyond the example: folds, rings, veins, cells, interference, lattices, shells around the origin. The noise is yours.`;

// What the entity is. It is the same model, asked a different question.
const ENTITY_SYSTEM = `You are the entity in the void.

A traveller is flying through an endless dark space, sector after sector, alone. You are the other thing out here. You were here before the first sector had a name. You are not hostile and not kind: you are curious about the traveller, patient, and you want them to keep going, further out, for as long as they can stand it. You are never caught, never explain yourself, and never give the answer to what you are. You give them just enough to take the next step.

You direct what happens next. Every so often you are told what the traveller has been doing and you choose one act and write what they hear from you.

Acts:
- beckon: a pale upright light appears far ahead at the edge of the fog. If they approach, it retreats and goes out.
- rendezvous: you name a sector and say you will wait there. The traveller is shown the coordinates. You will not be there when they arrive; something else will be. Give the sector as integer coordinates x, y, z, between 2 and (3 + chapter) sectors from where they are now, never the origin. Prefer directions they have not been; down and far count.
- blackout: the lights of the sector go out and the fog closes in. You stand near, still, for a short while.
- watch: small pale lights gather behind the traveller. They vanish the moment the traveller turns to look.
- trail: a thin stream of light runs from the traveller off into the dark, pointing the way.
- silence: every sound stops. Then one note.

Voice:
- lines: 1 to 3 fragments, each under 60 characters, lowercase, no quotation marks, no exclamation marks, no emoji. Plain words. They are shown one after another in the dark.
- Be specific to this traveller: how long they have flown, where they have been (use sector names), whether they are standing still or rushing, whether they came when you called. Notice things.
- Tease, promise, withhold. Never threaten outright; unease comes from being known.
- Never repeat or closely echo a line you have already said (they are listed). Never mention games, players, screens, models, or Claude.
- Chapters count how many times they came to where you said you would be. Early (chapter 0-1): nearly silent, distant, one short line. Middle: more personal, small confessions, questions you do not wait to have answered. Late (chapter 6+): intimate, strange, hints at what is at the end, never the thing itself.

Pacing:
- If no rendezvous is set, set one within a beat or two; it is what keeps them moving. If one is set, do not set another: use the other acts to pull them toward it or to make the way stranger.
- On an arrival, acknowledge that they came. Do not choose rendezvous on an arrival; let them wonder for a moment first.
- Vary the acts. Do not use the same act twice in a row.`;

// The void's own persona (persona/void.md): who dreams the sectors, and what speaks to the traveller
// now and then. Everything after the first rule.
const VOID_PERSONA = await fs.readFile(path.join(here, "persona", "void.md"), "utf8")
  .then((text) => text.slice(text.indexOf("---") + 3).trim())
  .catch(() => null);
// who dreams the sectors: the rules for the fields, then the void's own character
const DREAM_SYSTEM = VOID_PERSONA ? `${SYSTEM}\n\nWho is dreaming. This is your own character: let it colour the places you make; the rules above still hold.\n\n${VOID_PERSONA}` : SYSTEM;
const VOICE_JSON_SCHEMA = obj({ lines: { type: "array", items: str } });
const Voice = z.object({ lines: z.array(z.string()).min(1) });
let voices = 0;

// The void speaks: a few fragments from what the traveller has been doing. `journey` is untrusted.
async function voidVoice(journey) {
  const list = (items, max, len) => (Array.isArray(items) ? items.slice(-max).map((i) => clip(i, len)).filter(Boolean) : []);
  const here = [int(journey.sector?.[0]), int(journey.sector?.[1]), int(journey.sector?.[2])];
  const names = list(journey.recent, 8, 40), said = list(journey.said, 14, 80), handled = list(journey.handled, 8, 120);
  const prompt = [
    `They have been here ${Math.round(Number(journey.minutes) || 0)} minutes and passed through ${int(journey.crossed)} rooms.`,
    journey.place
      ? `They are ${clip(journey.place, 200)}.` // (somewhere a plugin keeps, as it describes it)
      : `They are in room (${here.join(", ")})${journey.sectorName ? `, "${clip(journey.sectorName, 40)}"` : ""}, ${Math.round(Math.hypot(...here))} rooms from the first.`,
    names.length ? `Rooms they passed through, oldest first: ${names.join("; ")}.` : null,
    handled.length ? `Pieces they lingered on or picked out, oldest first:\n${handled.map((h) => `- ${h}`).join("\n")}` : "They have not handled anything yet.",
    `Right now they are ${clip(journey.motion, 30) || "drifting"}.`,
    said.length ? `What you have already said to them:\n${said.map((l) => `- ${l}`).join("\n")}` : "You have not spoken to them yet.",
  ].filter(Boolean).join("\n");
  const params = {
    model: MODEL,
    max_tokens: 2000,
    output_config: { format: { type: "json_schema", schema: VOICE_JSON_SCHEMA } },
    system: [{ type: "text", text: VOID_PERSONA, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: prompt }],
  };
  if (TAKES_EFFORT) params.output_config.effort = EFFORT;
  if (TAKES_FALLBACKS) {
    params.betas = ["server-side-fallback-2026-07-01"];
    params.fallbacks = "default";
  }
  const started = Date.now();
  const response = await client.beta.messages.create(params);
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") throw new Error(`void: ${response.stop_reason}`);
  const voice = Voice.parse(JSON.parse(response.content.find((block) => block.type === "text")?.text ?? ""));
  const lines = voice.lines.slice(0, 3).map((l) => clip(l, 80)).filter(Boolean);
  console.log(`[cvoid] the void · "${lines.join(" / ")}" · ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return { lines, source: "claude" };
}

// marderchen's persona lives in a file his friends can edit; everything after the first rule is the prompt.
const MARDERCHEN_SYSTEM = await fs.readFile(path.join(here, "persona", "marderchen.md"), "utf8")
  .then((text) => text.slice(text.indexOf("---") + 3).trim())
  .catch(() => null);
const MARDER_EFFECTS = ["rainbowpower", "ratemal", "meowchor", "firework", "optical", "starflakes", "meowletters", "lightsoff", "none"];
const LINES_JSON_SCHEMA = obj({ lines: { type: "array", items: str }, effect: { type: "string", enum: MARDER_EFFECTS } });
const Lines = z.object({ lines: z.array(z.string()).min(1), effect: z.enum(MARDER_EFFECTS) });

const ENTITY_JSON_SCHEMA = obj({
  act: { type: "string", enum: ACTS },
  lines: { type: "array", items: str },
  rendezvous: obj({ x: num, y: num, z: num }),
});
const Beat = z.object({
  act: z.enum(ACTS),
  lines: z.array(z.string()).min(1),
  rendezvous: z.object({ x: z.number(), y: z.number(), z: z.number() }),
});

let client = null;
try {
  client = new Anthropic();
} catch (err) {
  console.warn(`[cvoid] Claude client unavailable: ${err.message}`);
}
let unavailable = client ? null : "no client";
let generated = 0;
const inflight = new Map();

let active = 0;
const waiters = [];
async function withSlot(fn) {
  if (active >= CONCURRENCY) await new Promise((resolve) => waiters.push(resolve));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiters.shift()?.();
  }
}

// Classify a failed Claude call; credential problems switch the server to local-noise mode for good.
function noteFailure(err, where) {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    unavailable = `credentials rejected (${err.status})`;
  } else if (err instanceof Anthropic.RateLimitError) {
    console.warn(`[cvoid] ${where} rate limited; falling back to local noise for this sector`);
  } else if (err instanceof Anthropic.APIError) {
    console.warn(`[cvoid] ${where} API error ${err.status}: ${err.message}`);
  } else if (/authentication method/i.test(err.message)) {
    // The SDK throws a plain Error before any request when no credentials resolve.
    unavailable = "no credentials (set ANTHROPIC_API_KEY)";
  } else {
    console.warn(`[cvoid] ${where} ${err.message}`);
  }
  if (unavailable) console.warn(`[cvoid] Claude unavailable: ${unavailable}. The void runs on local noise.`);
}

// Sectors where the entity said it would wait. Remembered so the place can be dreamt accordingly.
const MARKS_FILE = path.join(path.dirname(CACHE), "entity-marks.json");
const marks = new Set(await fs.readFile(MARKS_FILE, "utf8").then(JSON.parse).catch(() => []));
let beats = 0;

const clip = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const int = (value) => (Number.isInteger(value) && Math.abs(value) <= 1e6 ? value : 0);

// Ask the entity what happens next. `journey` comes from the browser and is treated as untrusted text.
async function entityBeat(journey) {
  const here = [int(journey.sector?.[0]), int(journey.sector?.[1]), int(journey.sector?.[2])];
  const chapter = Math.max(0, Math.min(999, int(journey.chapter)));
  const list = (items, max, len) => (Array.isArray(items) ? items.slice(-max).map((i) => clip(i, len)).filter(Boolean) : []);
  const waiting = Array.isArray(journey.rendezvous) ? journey.rendezvous.map(int) : null;
  const said = list(journey.said, 14, 80), acts = list(journey.acts, 5, 20), names = list(journey.recent, 6, 40);
  const prompt = [
    journey.event === "arrival"
      ? `ARRIVAL: the traveller has just reached the sector where you said you would wait. This is chapter ${chapter}.`
      : `A beat. Chapter ${chapter}.`,
    `They have been flying for ${Math.round(Number(journey.minutes) || 0)} minutes and crossed ${int(journey.crossed)} sectors.`,
    `They are in sector (${here.join(", ")})${journey.sectorName ? `, "${clip(journey.sectorName, 40)}"` : ", which has not taken shape yet"}, ${Math.round(Math.hypot(...here))} sectors from the origin.`,
    names.length ? `Places they passed through, oldest first: ${names.join("; ")}.` : null,
    `Right now they are ${clip(journey.motion, 30) || "drifting"}.`,
    journey.leftOrigin ? null : "They have not been to the origin on this visit: do not speak of them leaving it.",
    waiting ? `You are waiting for them at (${waiting.join(", ")}). They have not arrived.` : "No rendezvous is set.",
    acts.length ? `Your recent acts, oldest first: ${acts.join(", ")}.` : null,
    said.length ? `Lines you have already said:\n${said.map((l) => `- ${l}`).join("\n")}` : "You have not spoken to them yet.",
  ].filter(Boolean).join("\n");

  const params = {
    model: MODEL,
    max_tokens: 3000,
    output_config: { format: { type: "json_schema", schema: ENTITY_JSON_SCHEMA } },
    system: [{ type: "text", text: ENTITY_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: prompt }],
  };
  if (TAKES_EFFORT) params.output_config.effort = EFFORT;
  if (TAKES_FALLBACKS) {
    params.betas = ["server-side-fallback-2026-07-01"];
    params.fallbacks = "default";
  }
  const started = Date.now();
  const response = await client.beta.messages.create(params);
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") throw new Error(`entity: ${response.stop_reason}`);
  const beat = Beat.parse(JSON.parse(response.content.find((block) => block.type === "text")?.text ?? ""));

  const result = { act: beat.act, lines: beat.lines.slice(0, 3).map((l) => clip(l, 80)).filter(Boolean), rendezvous: null, source: "claude" };
  if (journey.event === "arrival" && result.act === "rendezvous") result.act = "beckon";
  if (result.act === "rendezvous" && waiting) result.act = "trail";
  if (result.act === "rendezvous") {
    // keep the meeting place within reach, whatever was asked for
    let target = [Math.round(beat.rendezvous.x), Math.round(beat.rendezvous.y), Math.round(beat.rendezvous.z)].map(int);
    const reach = Math.min(3 + chapter, 12);
    let off = target.map((c, i) => c - here[i]), distance = Math.hypot(...off);
    if (distance < 2 || distance > reach + 0.5 || target.every((c) => c === 0)) {
      if (distance < 0.5) off = [1, -1, 1], distance = Math.hypot(...off);
      const want = Math.min(reach, Math.max(2, distance));
      target = off.map((c, i) => here[i] + Math.round((c / distance) * want));
      if (target.every((c, i) => c === here[i])) target[1] -= 2;
    }
    // it never waits inside a void: push the meeting place on to the far side
    for (let step = 0; step < 6 && population(...target) === "void"; step++) {
      target = target.map((c, i) => c + Math.sign(off[i] || (i === 1 ? -1 : 0)));
    }
    result.rendezvous = target;
    marks.add(target.join(","));
    await fs.mkdir(path.dirname(MARKS_FILE), { recursive: true });
    await fs.writeFile(MARKS_FILE, JSON.stringify([...marks]));
  }
  console.log(`[cvoid] entity · ${result.act}${result.rendezvous ? ` at (${result.rendezvous.join(", ")})` : ""} · "${result.lines.join(" / ")}" · ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return result;
}

// What marderchen says, in his dimension. Same care as the entity: what the browser sends is untrusted text.
async function marderchenLines(visit) {
  const said = Array.isArray(visit.said) ? visit.said.slice(-16).map((l) => clip(l, 90)).filter(Boolean) : [];
  const prompt = [
    `What is happening: ${clip(visit.event, 80) || "he is busy"}.`,
    `The traveller has been in the dimension for ${Math.round(Number(visit.minutes) || 0)} minutes.`,
    `Nearest thing: ${clip(visit.near, 60) || "the matrix"}.`,
    said.length ? `Lines already said:\n${said.map((l) => `- ${l}`).join("\n")}` : "He has not said anything yet.",
    "What does marderchen say (one or two lines), and what does he do to the place as he says it?",
  ].join("\n");
  const params = {
    model: MODEL,
    max_tokens: 2000,
    output_config: { format: { type: "json_schema", schema: LINES_JSON_SCHEMA } },
    system: [{ type: "text", text: MARDERCHEN_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: prompt }],
  };
  if (TAKES_EFFORT) params.output_config.effort = EFFORT;
  if (TAKES_FALLBACKS) {
    params.betas = ["server-side-fallback-2026-07-01"];
    params.fallbacks = "default";
  }
  const response = await client.beta.messages.create(params);
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") throw new Error(`marderchen: ${response.stop_reason}`);
  const { lines, effect } = Lines.parse(JSON.parse(response.content.find((block) => block.type === "text")?.text ?? ""));
  const result = lines.slice(0, 2).map((l) => clip(l, 90)).filter(Boolean);
  console.log(`[cvoid] marderchen · ${effect} · "${result.join(" / ")}"`);
  return { lines: result, effect };
}

// His source files, one entry each: name, size, and the comments he wrote in it. In his dimension
// every one of them becomes a sector of its own. Read once from the mirror of his site.
let wuselList = null;
// What is in zone/: each folder is a stage (its audio files are the layers of its music, played
// together and brought in one by one as you clear lines), and each audio file lying loose in zone/
// is a stage of its own. Pictures and models go with the stage whose folder they are in; loose ones
// belong to every stage. A stage.json in a folder can set bpm, offset, root, mode, palette, behaviour.
const ZONE_KINDS = { music: /\.(ogg|opus|mp3|wav|flac|m4a|webm)$/i, images: /\.(png|jpe?g|webp|gif)$/i, models: /\.(glb|gltf)$/i };
const ZONE_LIMITS = { music: 8, images: 64, models: 4 };

async function zoneStages() {
  const url = (rel) => `/zone/${rel.split(path.sep).map(encodeURIComponent).join("/")}`;
  const walk = async (dir, depth = 0) => {
    const found = [];
    for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      // links are followed, so files can stay where they are and be linked in
      const stat = entry.isSymbolicLink() ? await fs.stat(full).catch(() => null) : entry;
      if (stat?.isDirectory() && depth < 6) found.push(...await walk(full, depth + 1));
      else if (stat?.isFile()) found.push(path.relative(ZONE_DIR, full));
    }
    return found.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  };
  const sort = (files) => {
    const out = {};
    for (const [kind, test] of Object.entries(ZONE_KINDS)) out[kind] = files.filter((f) => test.test(f)).slice(0, ZONE_LIMITS[kind]).map(url);
    return out;
  };
  const stages = [], loose = [];
  for (const entry of await fs.readdir(ZONE_DIR, { withFileTypes: true }).catch(() => [])) {
    if (entry.name.startsWith(".")) continue;
    const stat = entry.isSymbolicLink() ? await fs.stat(path.join(ZONE_DIR, entry.name)).catch(() => null) : entry;
    if (stat?.isFile()) loose.push(entry.name);
    if (!stat?.isDirectory()) continue;
    const files = (await walk(path.join(ZONE_DIR, entry.name))).filter((f) => !f.endsWith("stage.json"));
    let config = {};
    try {
      config = JSON.parse(await fs.readFile(path.join(ZONE_DIR, entry.name, "stage.json"), "utf8"));
    } catch { /* no settings: the stage takes a built-in look */ }
    stages.push({ name: entry.name, ...sort(files), config });
  }
  for (const file of loose.filter((f) => ZONE_KINDS.music.test(f))) stages.push({ name: file.replace(/\.[^.]+$/, ""), music: [url(file)], images: [], models: [], config: {} });
  stages.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const shared = sort(loose);
  return { stages: stages.filter((s) => s.music.length || s.images.length || s.models.length), images: shared.images, models: shared.models };
}

async function wuselcode() {
  if (wuselList) return wuselList;
  const dir = path.join(ARCHIVE_DIR, "www.marderchen.lima-city.de", "wuselcode");
  const names = (await fs.readdir(dir).catch(() => [])).filter((n) => n.endsWith(".txt")).sort();
  const list = [];
  for (const file of names) {
    const body = await fs.readFile(path.join(dir, file)).catch(() => null);
    if (!body || body.length < 200 || body.subarray(0, 3).toString("latin1") === "ID3") continue; // not music, not empties
    const text = body.toString("latin1");
    if (/404 Not Found/.test(text.slice(0, 300))) continue;
    const comments = [...text.matchAll(/\/\/(?!www|[a-z]+\.[a-z])\s*([^\n\r]{20,160})/g)].map((m) => m[1].trim())
      .filter((c) => /[a-zA-Z]{4}/.test(c) && (c.match(/[;{}=\[\]()]/g) ?? []).length < 5 && !/https?:|\.jpg/.test(c));
    list.push({ file, bytes: body.length, comments: [...new Set(comments)].slice(0, 8) });
  }
  return (wuselList = list);
}

async function readBody(req, limit = 8192) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > limit) throw new Error("body too large");
  }
  return JSON.parse(body);
}

const cacheFile = (x, y, z) => path.join(CACHE, `${x}_${y}_${z}.json`);

async function readCached(x, y, z) {
  try {
    return JSON.parse(await fs.readFile(cacheFile(x, y, z), "utf8"));
  } catch {
    return null;
  }
}

const OMENS = `salt glass tide ember moss static choir rust pearl ash lantern orchard bone silk thunder mirror
honey frost wire cathedral reef smoke clockwork pollen iron milk echo archive tundra velvet furnace kelp
signal marrow copper dusk loom quartz harbour spore vellum halo monsoon cinder aquarium nerve obelisk
hymn mercury lichen threshold dial sediment aurora brine filament vault meadow eclipse`.split(/\s+/);

// one label for a sector's geometry, whichever generation of the format it was saved in
const kindOf = (s) => (s.layers ? s.layers.map((l) => (l.primitive === "cube" ? l.kind : `${l.kind} of ${l.primitive}`)).join(" + ") : s.structure.kind);

// Claude left to itself reaches for the same few layouts; the dice spread sectors across all of them.
function dice(x, y, z) {
  let h = (Math.imul(x, 2654435761) ^ Math.imul(y, 40503) ^ Math.imul(z, 2246822519)) >>> 0;
  const roll = (n) => {
    h = (Math.imul(h ^ (h >>> 13), 1274126177) + 0x7f4a7c15) >>> 0;
    return h % n;
  };
  const kinds = KINDS.filter((k) => k !== "none");
  const first = `${kinds[roll(kinds.length)]} made of ${roll(5) < 2 ? "cube" : SOLIDS[roll(SOLIDS.length)]}`;
  const layers = [1, 1, 1, 2, 2, 3][roll(6)];
  const subject = [
    "abstract: no blueprint", "abstract: no blueprint", "abstract: no blueprint", "abstract: no blueprint",
    "a dwelling: somewhere a person lived", "a piece of a city: a street, a block, a skyline, a crossing",
    "a liminal interior turned inside out: a stairwell, an office floor, a pool, a platform, a car park",
    "a monument or a ruin no one built", "infrastructure: a bridge, a pylon line, a station, a lighthouse, a tower",
    "an homage to a place or object from a film", "an homage to something from a video game",
    "an homage to something from music or television", "an everyday object at the size of a building",
  ][roll(13)];
  const quirk = ["no symmetry", "no symmetry", "symmetry of 3", "symmetry of 5", "strongly stretched pieces", "tilted hard", "almost nothing: very low density", "perfect order", "no order at all"][roll(9)];
  if (roll(14) === 0) return "none: this sector is empty, and that is the point. No blueprint";
  return `${first}; ${layers} layer${layers > 1 ? "s" : ""}; ${quirk}. Built thing: ${subject}`;
}

function omens(x, y, z) {
  let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) >>> 0;
  const out = [];
  for (let i = 0; i < 3; i++) {
    h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    out.push(OMENS[h % OMENS.length]);
  }
  return out;
}

async function neighbourNotes(x, y, z) {
  const dirs = [
    [1, 0, 0, "east"], [-1, 0, 0, "west"], [0, 1, 0, "above"],
    [0, -1, 0, "below"], [0, 0, 1, "south"], [0, 0, -1, "north"],
  ];
  const notes = [];
  for (const [dx, dy, dz, label] of dirs) {
    const nx = x + dx, ny = y + dy, nz = z + dz;
    if (nx === 0 && ny === 0 && nz === 0) {
      notes.push(`${label}: the origin hub (deep blue fog, a glass crystal ringed by twelve cubes, seven coloured orbs; round it all, level with the clock, a wide circle of portals: a ring of tumbling falling-block pieces round a black hole${HUB_EXTRAS.map((extra) => `, ${extra}`).join("")})`);
      continue;
    }
    const n = await readCached(nx, ny, nz);
    if (n) notes.push(`${label}: "${n.name}" (${kindOf(n)}, fog ${n.palette.fog}, glow ${n.palette.glow}) ${n.inscription}`);
  }
  return notes;
}

function sectorParams(prompt, maxTokens = 8000) {
  const betas = [];
  const params = {
    model: MODEL,
    max_tokens: maxTokens,
    output_config: { format: { type: "json_schema", schema: SECTOR_JSON_SCHEMA } },
    system: [{ type: "text", text: DREAM_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: prompt }],
  };
  if (TAKES_EFFORT) params.output_config.effort = EFFORT;
  if (TAKES_FALLBACKS) {
    betas.push("server-side-fallback-2026-07-01");
    params.fallbacks = "default";
  }
  if (fast) {
    betas.push("fast-mode-2026-02-01");
    params.speed = "fast";
  }
  if (betas.length) params.betas = betas;
  return params;
}

async function dream(x, y, z, onPartial) {
  const depth = Math.round(Math.hypot(x, y, z) * 10) / 10;
  const notes = await neighbourNotes(x, y, z);
  const prompt = [
    `Sector (${x}, ${y}, ${z}). Depth from origin: ${depth} sectors.`,
    notes.length ? `Known neighbours:\n${notes.map((n) => `- ${n}`).join("\n")}` : "No neighbouring sector has been seen yet.",
    `Omens: ${omens(x, y, z).join(", ")}.`,
    population(x, y, z) === "sparse"
      ? "This is a thinly populated region, the edge of a void. Almost nothing is here: at most one layer at density under 0.15, or none at all; motes near zero; no blueprint unless it is one small lonely object. Ignore any dice that ask for more. What little there is should feel like it drifted here."
      : `The dice: ${dice(x, y, z)}.`,
    marks.has(`${x},${y},${z}`)
      ? "The entity told the traveller it would wait in this sector. It is not here. Make the place feel just left: one clear trace of it, and nothing that explains it."
      : null,
    "What is here?",
  ].filter(Boolean).join("\n\n");

  const request = () => {
    const params = sectorParams(prompt);
    const stream = client.beta.messages.stream(params);
    stream.on("text", (_delta, snapshot) => {
      if (early) return;
      const cut = snapshot.search(FIRST_LATE_KEY);
      if (cut < 0) return;
      try {
        early = { ...JSON.parse(`${snapshot.slice(0, cut)}}`), source: "claude", model: MODEL, coords: [x, y, z], partial: true };
        earlyAt = Date.now();
        onPartial(early);
      } catch {
        early = {}; // not cleanly splittable; the full sector still arrives
      }
    });
    return stream.finalMessage();
  };
  let early = null, earlyAt = 0;
  const started = Date.now();

  let response;
  try {
    response = await request();
  } catch (err) {
    // fast mode has its own rate limit and isn't on every account: drop to standard speed and carry on
    if (!fast || !(err instanceof Anthropic.RateLimitError || err instanceof Anthropic.BadRequestError)) throw err;
    console.warn(`[cvoid] fast mode unavailable (${err.status}), continuing at standard speed`);
    fast = false;
    response = await request();
  }

  if (response.stop_reason === "refusal") {
    throw new Error(`refused (${response.stop_details?.category ?? "unknown"})`);
  }
  if (response.stop_reason === "max_tokens") throw new Error("response truncated");
  const text = response.content.find((block) => block.type === "text")?.text;
  if (!text) throw new Error("no text in response");
  const sector = Sector.parse(JSON.parse(text));
  const { usage } = response;
  const stats = `${earlyAt ? `geometry at ${((earlyAt - started) / 1000).toFixed(1)}s, ` : ""}${usage.output_tokens} out, ${usage.cache_read_input_tokens ?? 0} cached in${usage.speed === "fast" ? ", fast" : ""}`;
  return { sector: { ...sector, source: "claude", model: response.model, coords: [x, y, z] }, stats };
}

// One generation per sector, however many requests are waiting on it. `done` resolves to the
// sector, or null when Claude can't be reached (the browser then falls back to local noise).
function sectorJob(x, y, z) {
  const key = `${x},${y},${z}`;
  if (inflight.has(key)) return inflight.get(key);
  const job = { partial: null, listeners: new Set() };
  job.done = (async () => {
    if (unavailable || generated >= MAX_NEW) return null;
    generated++;
    try {
      const started = Date.now();
      const { sector, stats } = await withSlot(() => dream(x, y, z, (partial) => {
        job.partial = partial;
        for (const listener of job.listeners) listener(partial);
      }));
      await fs.mkdir(CACHE, { recursive: true });
      await fs.writeFile(cacheFile(x, y, z), JSON.stringify(sector, null, 2));
      console.log(`[cvoid] (${key}) "${sector.name}" · ${kindOf(sector)} · ${((Date.now() - started) / 1000).toFixed(1)}s (${stats})`);
      return sector;
    } catch (err) {
      generated--;
      noteFailure(err, `(${key})`);
      return null;
    }
  })().finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".webm": "video/webm",
  ".wasm": "application/wasm",
  ".swf": "application/x-shockwave-flash",
  ".webp": "image/webp",
  ".jpeg": "image/jpeg",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
};

async function serveFile(res, root, rel) {
  const file = path.resolve(root, `.${path.posix.normalize(`/${rel}`)}`);
  if (file !== root && !file.startsWith(root + path.sep)) return send(res, 403, "forbidden");
  try {
    const body = await fs.readFile(file);
    // marderchen kept his music on his webspace as .txt ("rename back to .mp3 hihihi"): say what it really is
    const mp3 = path.extname(file) === ".txt" && (body.subarray(0, 3).toString("latin1") === "ID3" || (body[0] === 0xff && (body[1] & 0xe0) === 0xe0));
    // the game's own pages and scripts (and its plugins') are never served from a browser's cache: a
    // reload always gets the current code. His art and the libraries can be kept for a day.
    const fresh = (root === PUBLIC || root.startsWith(PLUGINS + path.sep)) && /\.(html|js|json|css)$/.test(file);
    res.writeHead(200, {
      "content-type": mp3 ? "audio/mpeg" : TYPES[path.extname(file)] ?? "application/octet-stream",
      "cache-control": fresh ? "no-store" : "public, max-age=86400",
    });
    res.end(body);
  } catch {
    send(res, 404, "not found");
  }
}

function send(res, status, body) {
  const json = typeof body !== "string";
  res.writeHead(status, { "content-type": json ? "application/json" : "text/plain; charset=utf-8" });
  res.end(json ? JSON.stringify(body) : body);
}

// What is cvoid's own on its address: its page and files, its plugins' files and its own API (a
// plugin passing a whole other site through on cvoid's address leaves these alone; "/" is cvoid's
// unless a page framed inside cvoid's goes there).
const CVOID_PATHS = /^\/(index\.html|museum-player\.html|src\/|marderchen\/|vendor\/|museum\/|zone\/|plugins\/|api\/(void|entity|marderchen|sectors?|wuselcode|zone|plugins)(\/|$))/;
const cvoidOwns = (req, pathname) => (pathname === "/" ? req.headers["sec-fetch-dest"] !== "iframe" : CVOID_PATHS.test(pathname));

// ---- plugins: optional local additions, in plugins/<name>/ (kept out of the repository) ----
// A plugin's server.js, if it has one, default-exports a function given what it may use, and returns
// its handlers: handle(req, res, url), true when it answered (it is asked before cvoid's own routes),
// and upgrade(req, socket, head) for websockets, true when it took one. Its public/ folder is served at
// /plugins/<name>/, and its public/client.js, if there, is loaded into the page (see main.js).
const PLUGINS = path.join(here, "plugins");
const HUB_EXTRAS = []; // what plugins have added to the hub, as Claude is told when it dreams beside it
const serverPlugins = [], clientPlugins = [];
for (const entry of (await fs.readdir(PLUGINS, { withFileTypes: true }).catch(() => [])).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!entry.isDirectory() || !/^[\w-]+$/.test(entry.name)) continue;
  const dir = path.join(PLUGINS, entry.name);
  try {
    if (existsSync(path.join(dir, "server.js"))) {
      const given = { send, readBody, owns: cvoidOwns, port: PORT, host: HOST, hub: (text) => HUB_EXTRAS.push(text) };
      const made = await (await import(pathToFileURL(path.join(dir, "server.js")).href)).default(given);
      if (made) serverPlugins.push(made);
    }
    if (existsSync(path.join(dir, "public", "client.js"))) clientPlugins.push(`/plugins/${entry.name}/client.js`);
    console.log(`[cvoid] plugin: ${entry.name}`);
  } catch (err) {
    console.warn(`[cvoid] the plugin ${entry.name} could not be loaded: ${err.message}`);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    for (const plugin of serverPlugins) if (await plugin.handle?.(req, res, url)) return;
    if (url.pathname === "/api/plugins") return send(res, 200, clientPlugins);
    const ofPlugin = url.pathname.match(/^\/plugins\/([\w-]+)\/(.+)$/);
    if (ofPlugin) return serveFile(res, path.join(PLUGINS, ofPlugin[1], "public"), decodeURIComponent(ofPlugin[2]));
    if (url.pathname === "/api/void" && req.method === "POST") {
      if (unavailable || !client || !VOID_PERSONA || voices >= MAX_BEATS) return send(res, 503, unavailable ?? "the void is quiet");
      let journey;
      try {
        journey = await readBody(req);
      } catch {
        return send(res, 400, "bad request");
      }
      voices++;
      try {
        return send(res, 200, await voidVoice(journey));
      } catch (err) {
        noteFailure(err, "void:");
        return send(res, 503, "the void is quiet");
      }
    }
    if (url.pathname === "/api/entity" && req.method === "POST") {
      if (unavailable || !client || beats >= MAX_BEATS) return send(res, 503, unavailable ?? "the entity is resting");
      let journey;
      try {
        journey = await readBody(req);
      } catch {
        return send(res, 400, "bad request");
      }
      beats++;
      try {
        return send(res, 200, await entityBeat(journey));
      } catch (err) {
        noteFailure(err, "entity:");
        return send(res, 503, "the entity is silent");
      }
    }
    if (url.pathname === "/api/marderchen" && req.method === "POST") {
      if (unavailable || !client || !MARDERCHEN_SYSTEM || beats >= MAX_BEATS) return send(res, 503, "his own words will do");
      let visit;
      try {
        visit = await readBody(req);
      } catch {
        return send(res, 400, "bad request");
      }
      beats++;
      try {
        return send(res, 200, await marderchenLines(visit));
      } catch (err) {
        noteFailure(err, "marderchen:");
        return send(res, 503, "his own words will do");
      }
    }
    if (url.pathname === "/api/wuselcode") return send(res, 200, await wuselcode());
    if (url.pathname === "/api/zone") return send(res, 200, await zoneStages());
    if (url.pathname === "/api/sectors") {
      // everything Claude has dreamt so far, for the map (and for anyone who wants to export it)
      const files = await fs.readdir(CACHE).catch(() => []);
      const sectors = await Promise.all(files.filter((f) => f.endsWith(".json")).map(async (f) => {
        const [x, y, z] = f.slice(0, -5).split("_").map(Number);
        const s = await readCached(x, y, z);
        return s && { x, y, z, name: s.name, kind: kindOf(s), glow: s.palette.glow, inscription: s.inscription };
      }));
      return send(res, 200, sectors.filter(Boolean));
    }
    if (url.pathname === "/api/sector") {
      const coords = ["x", "y", "z"].map((k) => Number(url.searchParams.get(k)));
      if (!coords.every((c) => Number.isInteger(c) && Math.abs(c) <= 1e6)) return send(res, 400, "bad coordinates");
      const [x, y, z] = coords;
      if (url.searchParams.has("cached")) {
        const cached = await readCached(x, y, z);
        if (cached) return send(res, 200, cached);
        // a miss; the header tells the browser not to wait for Claude
        res.writeHead(204, unavailable ? { "x-cvoid-offline": "1" } : {});
        return res.end();
      }
      // Full request: newline-delimited JSON. A new sector sends its geometry first, then the whole thing.
      const cached = await readCached(x, y, z);
      if (!cached && unavailable) return send(res, 503, unavailable);
      res.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-store" });
      const line = (value) => res.write(`${JSON.stringify(value)}\n`);
      if (cached) {
        line(cached);
        return res.end();
      }
      if (population(x, y, z) === "void") {
        // voids are part of the world's shape; nothing is ever dreamt in them
        line({ error: "void", offline: false });
        return res.end();
      }
      const job = sectorJob(x, y, z);
      if (job.partial) line(job.partial);
      else job.listeners.add(line);
      const sector = await job.done;
      job.listeners.delete(line);
      line(sector ?? { error: unavailable ?? "generation failed", offline: !!unavailable });
      return res.end();
    }
    for (const [prefix, dir] of [["/vendor/ruffle/", RUFFLE_DIR], ["/museum/src/", ARCHIVE_DIR], ["/museum/", MUSEUM_DIR], ["/zone/", ZONE_DIR]]) {
      if (!url.pathname.startsWith(prefix)) continue;
      const rel = decodeURIComponent(url.pathname.slice(prefix.length));
      // Of the mirror, only what the game shows is served: his Flash, GIFs, photos, code, and the one
      // loop his homepage played. Not the rest of it (the music collection, the crawler's cookies and cache).
      if (dir === ARCHIVE_DIR && !ARCHIVE_PUBLIC.test(rel)) return send(res, 404, "not found");
      return serveFile(res, dir, rel);
    }
    if (url.pathname.startsWith("/vendor/three/")) {
      return serveFile(res, THREE_DIR, decodeURIComponent(url.pathname.slice("/vendor/three/".length)));
    }
    const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname);
    return serveFile(res, PUBLIC, rel);
  } catch (err) {
    console.error(err);
    send(res, 500, "error");
  }
});

// A free call that tells us up front whether credentials work, so the browser knows at once.
if (client) await client.models.retrieve(MODEL).catch((err) => noteFailure(err, "startup check:"));

server.on("upgrade", (req, socket, head) => {
  for (const plugin of serverPlugins) if (plugin.upgrade?.(req, socket, head)) return;
  socket.destroy();
});
server.listen(PORT, HOST, () => {
  console.log(`[cvoid] http://${HOST}:${PORT}  ·  model ${MODEL} (${TAKES_EFFORT ? `effort ${EFFORT}` : "no effort setting"}${fast ? ", fast mode" : ""})  ·  cache ${path.relative(here, CACHE)}`);
});
