import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { SCREENS, screenPass } from "./screen.js";
import { VoidVoice } from "./voice.js";
import { World, CELL, addRealm } from "./world.js";
import { VoidAudio } from "./audio.js";
import { VoidMap } from "./map.js";
import { Entity } from "./entity.js";
import { Marderchen, REALM } from "./marderchen.js";
import { Zone, ZONE } from "./zone.js";
import { PadMap } from "./pad.js";
import { SPAWN } from "./constants.js";
import { draggablePanels } from "./panels.js";

const $ = (id) => document.getElementById(id);
const canvas = $("view");

// with an alpha channel: opaque everywhere, but a plugin may cut a hole in the picture to show
// something it places behind it (a page, say), which what hangs in front then hides as it should
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", alpha: true });
renderer.setClearColor(0x000000, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 1, CELL * 3.4); // far enough to see into the next sectors
camera.rotation.order = "YXZ";

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const BLOOM = 0.6;
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM, 0.6, 0.55);
composer.addPass(bloom);
// the glow is added to the colour only: over such a hole it glows, without filling it
Object.assign(bloom.blendMaterial, { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
composer.addPass(new OutputPass());
const screen = screenPass(); // the glass it is all seen through (Tab panel: screen)
composer.addPass(screen.pass);

const audio = new VoidAudio();

// ---- HUD ----

const hud = { key: null, materialized: false };
function onSector(spec, shown, key) {
  const arrived = hud.key === key && !hud.materialized && spec; // it materialized around us
  const status = !spec
    ? "unmaterialized · reaching for claude"
    : spec.partial ? "materializing · claude is still writing the sky"
    : spec.source === "claude" ? `dreamt by ${spec.model ?? "claude"}`
    : spec.source === "origin" ? "origin"
    : spec.source === "void" ? "nothing was ever here"
    : spec.source === "chaostyper" ? "don't know the future seens to be an error"
    : spec.source === "marderchen" ? "[MEOW] by marderchen · its free · have fun :3 =^.^="
    : spec.source === "zone" ? "the zone · R looks at the well · P plays at it"
    : hook("status", spec) || "local noise · claude unreachable";
  const name = spec ? spec.name : "· · ·";
  const changed = hud.key !== key || $("name").textContent !== name;
  $("name").textContent = name;
  $("inscription").textContent = spec ? spec.inscription : "";
  $("status").textContent = status;
  $("meta").classList.toggle("waiting", !spec || spec.partial);
  $("meta").style.color = spec ? spec.palette.accent : "";
  if (changed) {
    const sector = $("sector");
    sector.classList.remove("enter");
    void sector.offsetWidth; // restart the reveal animation
    sector.classList.add("enter");
    wakeHud(); // a new place (a sector, a dimension, a room, a thread): its name for a moment, then the void alone
  }
  audio.setSector(shown.sound);
  if (arrived) audio.arrive();
  if (started) map.visit(key); // on the map from now on
  hud.key = key;
  hud.materialized = !!spec;
}

const map = new VoidMap($("map"));
const spawnAt = (() => { try { return JSON.parse(localStorage.getItem("cvoid.spawn")); } catch { return null; } })();
const world = new World(scene, renderer, { onSector, onSpec: (key, spec) => map.add(key, spec) });
for (const [key, spec] of world.specs) map.add(key, spec); // the hub and the two doors: fixed places, not what the cache remembers
map.load();

// Resolution follows the frame rate: a slow GPU gets fewer pixels instead of a stalled driver.
const MAX_RATIO = Math.min(window.devicePixelRatio, 1.5), MIN_RATIO = 0.5;
let ratio = MAX_RATIO;
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(ratio);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(ratio);
  composer.setSize(w, h);
  screen.resize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  world.G.uPx.value = (ratio * h) / 900;
  map.resize();
}
// It goes by the typical frame (the median), not the average: one stall (a sector being built, a
// shader compiled) is not a slow machine, and dropping the resolution for it is a visible jump.
const pace = { time: 0, frames: [], hold: 0 };
function adaptResolution(dt) {
  pace.time += dt;
  pace.frames.push(dt);
  pace.hold -= dt;
  if (pace.time < 1.5) return;
  const frame = pace.frames.sort((a, b) => a - b)[pace.frames.length >> 1];
  pace.time = 0;
  pace.frames = [];
  if (frame > 1 / 38 && ratio > MIN_RATIO) {
    ratio = Math.max(MIN_RATIO, ratio * 0.82);
    pace.hold = 12; // don't climb straight back into the stall
    resize();
  } else if (frame < 1 / 54 && ratio < MAX_RATIO && pace.hold <= 0) {
    ratio = Math.min(MAX_RATIO, ratio * 1.1);
    resize();
  }
}
window.addEventListener("resize", resize);
resize();

// ---- flight ----

const keys = new Set();
const ahead = new THREE.Vector3();
const velocity = new THREE.Vector3();
const thrust = new THREE.Vector3();
// yaw/pitch are where the player is aiming; the camera eases onto them
let yaw = 0, pitch = 0, viewYaw = 0, viewPitch = 0, started = false, touchThrust = 0, autofly = false;
let roll = 0, viewRoll = 0; // Q and E turn the view about where you are looking
const ROLL = 1.4;          // radians per second

const THRUST = 150, SURGE = 9, DRAG = 1.6;
const ZOOM = 0.5, ZOOM_AFTER = 0.18; // right button held: the lens narrows to this (about 2× nearer), once held this many seconds
let rightHeld = 0; // when the right button went down (0: it is up)
const AHEAD = 1.4; // flying forward (W) goes this much faster than sideways, back or up
// Shift surges; tapped twice quickly and held, it surges harder still, until it is let go
const HYPER = 3, DOUBLE_TAP = 300; // ms between the two taps
let lastShift = -Infinity, hyper = false;
const BODY = 14;  // how wide you are, for bumping into things
let bumpIn = 0;   // a knock is heard at most this often
const MOUSE_LOOK = 0.0016;  // radians per count of raw mouse movement
const LOOK_EASE = 30;       // higher = tighter; removes the stepping of low-rate mice without feeling laggy
const PAD_LOOK = 2.6;       // radians per second at full stick
const DEADZONE = 0.14;

const stored = (name, fallback) => {
  try { return JSON.parse(localStorage.getItem(`cvoid.${name}`)) ?? fallback; } catch { return fallback; }
};
const store = (name, value) => {
  try { localStorage.setItem(`cvoid.${name}`, JSON.stringify(value)); } catch { /* private mode */ }
};
let sensitivity = stored("sensitivity", 1), invertY = stored("invertY", false);
const padMap = new PadMap({ stored, store }); // the controller's buttons, as the player has them (Tab panel: controller)
draggablePanels({ stored, store }); // the Tab panel's windows: moved and resized at will, remembered

const entity = new Entity({ scene, world, audio, map, textEl: $("entity"), waitsEl: $("waits"), stored, store });
// turn to face this way (the view eases round, the short way)
function face(toYaw, toPitch) {
  yaw = viewYaw + Math.atan2(Math.sin(toYaw - viewYaw), Math.cos(toYaw - viewYaw));
  pitch = viewPitch + Math.atan2(Math.sin(toPitch - viewPitch), Math.cos(toPitch - viewPitch));
}
// coming out of a portal (or sitting down at the well): face this way and lose most of your speed
function arrive(toYaw, toPitch) {
  face(toYaw, toPitch);
  velocity.multiplyScalar(0.1);
}
const marderchen = new Marderchen({ scene, world, audio, textEl: $("marder"), stored, store, arrive });
const zone = new Zone({ scene, world, audio, hintEl: $("hint"), stored, store, arrive, face, levelOut: () => levelOut() });
// ---- plugins: optional local additions, in plugins/<name>/ beside cvoid (kept out of its repository) ----
// The server says which there are (see server.js); each one's client.js default-exports install(cvoid),
// given the pieces of the game it may use (see the end of this file), and returns its hooks, all
// optional: update(dt, camera) each frame of flight · idle(dt) before it starts · busy() something of
// its own is open (flight and the keys wait) · key(e) / mouse(e) / rightClick() / wheel(e): true when
// it took it · look(dx, dy) you turned the view · autofly(on): true (or a note) when it flies for you
// its own way · steer(camera, dt, hurry): where to go and look · pull, roll, fade: its pull on you, its
// tilt, the dark at its door · collide(position, velocity, radius) · status(spec): the HUD's line for
// its sectors · target(): what R turns you to · notice(): what you are with (for the void's voice) ·
// leaveRealm / enterRealm(realm, camera): going there by the map · help: its keys, for the help line ·
// interact(): the controller's interact button, true when it opened or entered something of its own ·
// pad(pad): the controller each frame of flight, before cvoid's own buttons (its own actions: pad.addActions)
const plugins = [];
const hook = (name, ...args) => {
  for (const p of plugins) {
    const answer = typeof p[name] === "function" ? p[name](...args) : null;
    if (answer) return answer;
  }
  return null;
};
const realmNames = { [REALM]: "marderchen's dimension", [ZONE]: "the zone" }; // for the HUD (a plugin's are added)
const voice = new VoidVoice({ world, notice: () => hook("notice"), textEl: $("voidVoice"), stored, store }); // the void itself, now and then

// the screen: chosen in the Tab panel, remembered
{
  let chosen = stored("screen", "none");
  const row = $("mScreen"), buttons = SCREENS.map((name) => {
    const b = Object.assign(document.createElement("button"), { textContent: name });
    b.onclick = () => { chosen = name; store("screen", name); show(); };
    row.append(b);
    return b;
  });
  const show = () => {
    screen.set(chosen);
    buttons.forEach((b, i) => b.classList.toggle("on", SCREENS[i] === chosen));
  };
  show();
}
const fadeEl = $("fade");

// Going somewhere at once, from the map: in the dark, into whichever dimension the place is in.
function teleport(realm, x, y, z) {
  zone.stand();
  if (world.realm !== realm) {
    if (world.realm === ZONE) zone.travel(camera); // back out to the void first
    else if (world.realm === REALM) marderchen.travel(camera);
    else hook("leaveRealm", world.realm, camera);
    if (realm === ZONE) zone.travel(camera);
    else if (realm === REALM) marderchen.travel(camera);
    else hook("enterRealm", realm, camera);
  }
  camera.position.set(x, y, z);
  velocity.set(0, 0, 0);
  autofly = false;
  zone.veil = Math.max(zone.veil, 1.1); // the jump happens in the dark, which lifts
}
map.bind({
  spawn: spawnAt,
  onGo(realm, x, y, z) {
    if (realm === "void" && x === SPAWN[0] && y === SPAWN[1] && z === SPAWN[2]) spawnHere(); // (the origin: looking at the clock)
    else teleport(realm, x, y, z);
    if (map.open) map.toggle(); // and you see where you are
    lockPointer();
  },
  onSpawn: (spawn) => store("spawn", spawn),
});

const HELP = {
  keys: "mouse look · w a s d fly · q e roll · enter autofly · space / c rise, sink · shift surge (twice: faster) · r level out · - = volume · f fullscreen · tab map · b listen to the room · [ ] sensitivity · i invert · h keep hud · m mute · hold right zoom",
  get pad() { return padMap.help("flight"); }, // (as the buttons are mapped: see pad.js)
  // sitting at the well in the zone
  "play-keys": "← → move · ↓ soft drop · space hard drop · ↑ x rotate · z ctrl rotate back · a turn round · c shift hold · q e roll · ← → before a run: another well · r look at the well · p stand up",
  get ["play-pad"]() { return padMap.help("well"); },
};
let helpMode = "keys", noteTimer = 0, wakeTimer = 0;
// The keys, in the Tab panel: cvoid's own (the keyboard's or the gamepad's, whichever was used last),
// then each plugin's ("in f0ck: e open · ..."), every one a key and what it does. Seated at the well,
// its game keys stay on the screen as well, under the game.
function showHelp(mode = helpMode) {
  helpMode = mode;
  const theirs = mode === "keys" ? plugins.map((p) => p.help).filter(Boolean) : [];
  const groups = [[mode === "pad" ? "gamepad" : "cvoid", HELP[mode]], ...theirs.map((help) => {
    const [, of, keys] = help.match(/^in ([^:]+):\s*(.*)$/) ?? [null, "", help];
    return [of, keys];
  })];
  if (zone.seated) groups.unshift([`the well${mode === "pad" ? ", gamepad" : ""}`, HELP[`play-${mode}`]]);
  const blocks = groups.map(([of, keys]) => {
    const title = Object.assign(document.createElement("div"), { className: "of", textContent: of });
    const list = Object.assign(document.createElement("div"), { className: "keys" });
    for (const entry of keys.split(" · ")) {
      // "w a s d fly" -> the keys, and what they do (the first word that is not a key on its own)
      const words = entry.split(" "), at = Math.max(1, words.findIndex((w, i) => i > 0 && w.length > 2 && !/^(shift|ctrl|enter|space|tab|right|left|click|wheel|esc|backspace|arrows|stick|sticks|left-stick|right-stick|d-pad|triggers|bumpers|select|start)$/.test(w)));
      list.append(Object.assign(document.createElement("b"), { textContent: words.slice(0, at).join(" ") }), Object.assign(document.createElement("span"), { textContent: words.slice(at).join(" ") }));
    }
    return [title, list];
  });
  // the first group (cvoid's own, or the well's) a column of its own; the rest beside it
  const column = () => Object.assign(document.createElement("div"), { className: "column" }), left = column(), right = column();
  left.append(...blocks[0]);
  right.append(...blocks.slice(1).flat());
  $("keysList").replaceChildren(left, ...(blocks.length > 1 ? [right] : []));
  $("help").textContent = zone.seated ? HELP[`play-${mode}`] : "";
}
// a word on what just happened, under the crosshair for a moment
function note(text) {
  const el = $("note");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => el.classList.remove("show"), 1800);
}
// the place's name and the line under it, for a while (unless H keeps them: see the keys)
function wakeHud(seconds = 6) {
  $("sector").classList.add("awake");
  $("meta").classList.add("awake");
  clearTimeout(wakeTimer);
  wakeTimer = setTimeout(() => { $("sector").classList.remove("awake"); $("meta").classList.remove("awake"); }, seconds * 1000);
}
showHelp();

// Free look: nothing stops at straight up or straight down. Keep pulling back and you go over the
// top and fly on upside down. While you are upside down, left and right are swapped back so that
// moving the mouse left still turns the view left.
function look(dx, dy, scale) {
  if (dx || dy) for (const p of plugins) p.look?.(dx, dy); // (a plugin flying you somewhere lets you look about)
  // rolled over, the mouse still moves the view the way it moves on the screen
  const c = Math.cos(viewRoll), s = Math.sin(viewRoll);
  [dx, dy] = [dx * c + dy * s, dy * c - dx * s];
  yaw -= dx * scale * (Math.cos(pitch) < 0 ? -1 : 1);
  pitch -= dy * scale * (invertY ? -1 : 1);
  if (Math.abs(pitch) > Math.PI) { // keep the number small; a full turn is the same view
    const turn = Math.sign(pitch) * Math.PI * 2;
    pitch -= turn;
    viewPitch -= turn;
  }
}
function changeSensitivity(factor) {
  sensitivity = THREE.MathUtils.clamp(sensitivity * factor, 0.2, 5);
  store("sensitivity", sensitivity);
  note(`look sensitivity × ${sensitivity.toFixed(2)}`);
}
function toggleInvert() {
  invertY = !invertY;
  store("invertY", invertY);
  note(`vertical look ${invertY ? "inverted" : "normal"}`);
}
// R: level out. Upright again, the horizon level and no tilt left from a portal, still heading the
// way you were going (upside down over the top, that is the other way round). In the zone, facing the well.
let levelling = 0;
function levelOut() {
  levelling = 0.8;
  const turns = Math.round(roll / (Math.PI * 2)) * Math.PI * 2; // whole turns are unwound at once: the short way back to level
  viewRoll -= turns;
  roll = 0;
  if (world.realm === ZONE) return zone.lookAtWell();
  // to whatever a plugin says you are with
  const target = hook("target");
  if (target) {
    const to = target.clone().sub(camera.position), length = to.length() || 1;
    return face(Math.atan2(-to.x, -to.z), Math.asin(Math.max(-1, Math.min(1, to.y / length))));
  }
  face(Math.cos(pitch) < 0 ? yaw + Math.PI : yaw, 0);
}
// Enter: keep flying forward by itself until Enter again, or until you pull back
function toggleAutofly(on) {
  // a plugin may fly you its own way instead (its answer may be a note to show)
  const taken = hook("autofly", on);
  if (taken) return void (typeof taken === "string" && note(taken));
  on ??= !autofly;
  if (on === autofly) return;
  autofly = on;
  note(autofly ? "autofly on · enter or s to stop" : "autofly off");
}
// Volume: a slider on the start screen and in the map's panel, and - / = while flying. Remembered.
const sliders = [...document.querySelectorAll(".volume")];
function setVolume(volume, say = false) {
  volume = audio.setVolume(volume);
  store("volume", volume);
  for (const label of sliders) {
    label.querySelector("input").value = Math.round(volume * 100);
    label.querySelector("input").style.setProperty("--v", volume); // how much of the line is lit
    label.querySelector("output").textContent = Math.round(volume * 100);
  }
  if (say) note(`volume ${Math.round(volume * 100)}${audio.muted ? " · muted (m)" : ""}`);
}
for (const label of sliders) {
  // changing the volume on the start screen does not start the game
  for (const type of ["click", "pointerdown"]) label.addEventListener(type, (e) => e.stopPropagation());
  label.querySelector("input").addEventListener("input", (e) => setVolume(e.target.value / 100));
  label.querySelector("input").addEventListener("keydown", (e) => e.stopPropagation()); // its arrow keys are its own
}
setVolume(stored("volume", 1));

// The mix, under the volume in the Tab panel: how loud each kind of sound is (0 to 150%), remembered.
{
  const MIX = [["void", "the void"], ["music", "music"], ["sounds", "sounds"], ["voice", "voices"], ["media", "radio, posts"]];
  const mix = stored("mix", {});
  const rows = MIX.map(([name, title]) => {
    const row = Object.assign(document.createElement("label"), { className: "volume mixer" });
    const input = Object.assign(document.createElement("input"), { type: "range", min: 0, max: 150, step: 1 }), shown = document.createElement("output");
    row.append(Object.assign(document.createElement("span"), { textContent: title }), input, shown);
    const set = (percent) => {
      input.value = percent;
      input.style.setProperty("--v", percent / 150); // (how much of the line is lit)
      shown.textContent = percent;
      audio.setMix(name, percent / 100);
    };
    set(Math.round((Number.isFinite(mix[name]) ? mix[name] : 1) * 100));
    input.addEventListener("input", () => { set(+input.value); mix[name] = +input.value / 100; store("mix", mix); });
    input.addEventListener("keydown", (e) => e.stopPropagation()); // (its arrow keys are its own)
    input.addEventListener("dblclick", () => { set(100); mix[name] = 1; store("mix", mix); }); // (twice: back to as it comes)
    return row;
  });
  const box = Object.assign(document.createElement("div"), { className: "mix" });
  box.append(Object.assign(document.createElement("div"), { className: "of", textContent: "mix · double click a slider: back to 100" }), ...rows);
  $("mapPanel").append(box);
}

function toggleMute() {
  note(audio.toggleMute() ? "muted" : "sound on");
}

// everyone's place to start (SPAWN), turned to the clock in the middle of the hub
function spawnHere() {
  teleport("void", ...SPAWN);
  const to = camera.position.clone().negate(), length = to.length() || 1;
  yaw = viewYaw = Math.atan2(-to.x, -to.z);
  pitch = viewPitch = Math.asin(to.y / length);
}

function start() {
  if (started) return;
  started = true;
  // take over from the idle orbit without a jump
  yaw = viewYaw = camera.rotation.y;
  pitch = viewPitch = camera.rotation.x;
  audio.start();
  // a chosen place to start, set on the map; else everyone's, looking at the clock
  if (map.spawn) teleport(map.spawn.realm, map.spawn.x, map.spawn.y, map.spawn.z);
  else spawnHere();
  map.visit(world.currentKey); // where you begin counts as explored
  voice.arrived(); // (someone it knows, it greets)
  $("start").classList.add("gone");
  $("hud").classList.add("on");
  $("crosshair").classList.add("on");
  wakeHud(9); // where you begin, named a while (with the HUD's slow first reveal)
}

// Raw mouse input where the browser offers it: the OS pointer acceleration curve
// is what makes locked-pointer look feel slippery.
async function lockPointer() {
  if (!canvas.requestPointerLock || document.pointerLockElement === canvas) return;
  try {
    await canvas.requestPointerLock({ unadjustedMovement: true });
  } catch (err) {
    if (err.name === "NotSupportedError") canvas.requestPointerLock()?.catch?.(() => {});
  }
}

$("start").addEventListener("click", () => {
  start();
  lockPointer();
});
canvas.addEventListener("click", lockPointer);
document.addEventListener("pointerlockchange", () => {
  skipMoves = 2;
  // Esc (the browser takes it to let go of the pointer, and the page never hears it): at the well the
  // game pauses, and taking the pointer again (a click) goes on
  if (document.pointerLockElement === canvas) zone.resume();
  else zone.pause();
});
let skipMoves = 0;
document.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== canvas) return;
  // the first events after locking, and occasional huge deltas some browsers emit, would snap the view
  if (skipMoves > 0) return void skipMoves--;
  if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
  look(e.movementX, e.movementY, MOUSE_LOOK * sensitivity * (camera.fov / 70)); // zoomed in, the view turns as much less
});
window.addEventListener("keydown", (e) => {
  // the controller page waiting for a button: Esc stops waiting
  if (padMap.capturing && e.code === "Escape") return void padMap.cancel();
  // the map is open: Tab or Esc closes it, O goes back to the origin; flying goes on
  if (map.open && !e.repeat && (e.code === "Escape" || e.code === "Tab")) {
    e.preventDefault();
    map.toggle();
    lockPointer();
    return;
  }
  if (map.open && !e.repeat && e.code === "KeyO") map.origin();
  // at the well in the zone the game has the keys it plays with; the rest still work
  const sitting = zone.seated;
  if (zone.key(e, true)) {
    e.preventDefault();
    if (!sitting) keys.clear(); // just sat down: stop flying
    return;
  }
  // a museum piece is open: E and Esc belong to it, everything else waits
  if (marderchen.museum.open) {
    if (e.code === "KeyE" && !e.repeat) marderchen.museum.toggle();
    if (e.code === "Escape") marderchen.museum.close();
    return;
  }
  // a plugin's own keys (or all of them, while something of its own is open)
  if (hook("key", e)) return;
  if (!e.repeat) {
    // in his museum E opens the piece you are looking at; everywhere else it rolls the view
    if (e.code === "KeyE" && marderchen.museum.canOpen()) { keys.clear(); marderchen.museum.toggle(); }
    if (helpMode !== "keys") showHelp("keys");
    if (e.code === "KeyM") toggleMute();
    if (e.code === "Minus" || e.code === "NumpadSubtract") setVolume(audio.volume - 0.1, true);
    if (e.code === "Equal" || e.code === "NumpadAdd") setVolume(audio.volume + 0.1, true);
    if (e.code === "Enter" || e.code === "NumpadEnter") toggleAutofly();
    if (e.code === "KeyS") toggleAutofly(false);
    if (e.code === "KeyI") toggleInvert();
    if (e.code === "KeyH") note(document.body.classList.toggle("hud-shown") ? "hud kept" : "hud comes and goes"); // the place's name kept on the screen, and let go again
    if (e.code === "KeyR") levelOut();
    if (e.code === "Tab") map.toggle();
    if (e.code === "KeyF") toggleFullscreen();
    if (e.code === "KeyB") audio.toggleMic().then((on) => note(on ? "listening to the room" : "listening to the void"), () => note("microphone unavailable"));
    if (e.code === "PageUp") map.shift(1);
    if (e.code === "PageDown") map.shift(-1);
  }
  if (["Tab", "PageUp", "PageDown"].includes(e.code)) e.preventDefault();
  if (e.code === "BracketLeft") changeSensitivity(1 / 1.1);
  if (e.code === "BracketRight") changeSensitivity(1.1);
  if (e.code === "Space") e.preventDefault();
  if ((e.code === "ShiftLeft" || e.code === "ShiftRight") && !e.repeat) {
    if (e.timeStamp - lastShift < DOUBLE_TAP && !hyper) { hyper = true; note("surge · faster"); }
    lastShift = e.timeStamp;
  }
  keys.add(e.code);
});
window.addEventListener("keyup", (e) => {
  keys.delete(e.code);
  if (!keys.has("ShiftLeft") && !keys.has("ShiftRight")) hyper = false;
  zone.key(e, false);
});

// Ctrl+W closes the tab, Ctrl+Shift+W the whole window, Ctrl+Q the browser: easy to hit while
// flying, and a page cannot block them. Two defences: the browser asks before leaving a running
// flight, and in fullscreen (F) Chromium hands those keys to the game instead.
window.addEventListener("beforeunload", (e) => {
  if (!started) return;
  e.preventDefault();
  e.returnValue = "";
});
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) return await document.exitFullscreen();
    await document.documentElement.requestFullscreen();
    await navigator.keyboard?.lock?.();
    lockPointer();
  } catch { /* fullscreen refused: nothing to undo */ }
}
// the left button is the plugins'; the right one, held, zooms in
// (see ZOOM), and let go quickly it is a click, which is the plugins' again
const aiming = () => started && document.pointerLockElement === canvas && !map.open;
document.addEventListener("mousedown", (e) => {
  if (e.button === 2 && aiming()) rightHeld = e.timeStamp;
  if (e.button === 0 && aiming()) hook("mouse", e);
});
document.addEventListener("mouseup", (e) => {
  if (e.button !== 2 || !rightHeld) return;
  const click = e.timeStamp - rightHeld < ZOOM_AFTER * 1000;
  rightHeld = 0;
  if (click && aiming()) hook("rightClick");
});
document.addEventListener("pointerlockchange", () => { if (document.pointerLockElement !== canvas) rightHeld = 0; });
document.addEventListener("contextmenu", (e) => { if (document.pointerLockElement === canvas) e.preventDefault(); });
// the wheel is the plugins'
window.addEventListener("wheel", (e) => {
  if (started && !map.open && hook("wheel", e)) e.preventDefault();
}, { passive: false });
window.addEventListener("blur", () => { keys.clear(); hyper = false; });
// a gamepad press can't unlock audio on its own; any later click or key does
for (const type of ["pointerdown", "keydown"]) window.addEventListener(type, () => audio.ctx?.resume());

// ---- gamepad (standard mapping, its buttons as the player has mapped them: see pad.js) ----

const pad = { x: 0, y: 0, rise: 0, roll: 0, surge: false };
const stick = (v) => {
  const m = Math.abs(v);
  return m < DEADZONE ? 0 : Math.sign(v) * ((m - DEADZONE) / (1 - DEADZONE));
};
// The controller in use. With more than one connected (a PS3 controller left plugged in beside a
// DualSense, say), the first in the browser's list is not necessarily the one in your hands: the one
// used is kept until another has a button pressed or a stick pushed well over, and only then does
// that one take over. One in the browser's standard layout is preferred.
let padIndex = null;
function activePad() {
  const all = [...(navigator.getGamepads?.() ?? [])].filter((g) => g?.connected && g.axes.length >= 4 && g.buttons.length >= 10);
  const standard = all.filter((g) => g.mapping === "standard"), pads = standard.length ? standard : all;
  const touched = pads.find((g) => g.index !== padIndex && (g.buttons.some((b) => b.pressed) || g.axes.slice(0, 4).some((v) => Math.abs(v) > 0.6)));
  const current = pads.find((g) => g.index === padIndex);
  const gp = touched ?? current ?? pads[0] ?? null;
  if (gp) padIndex = gp.index;
  return gp;
}
function pollPad(dt) {
  pad.x = pad.y = pad.rise = pad.roll = 0;
  pad.surge = false;
  const gp = activePad();
  if (!gp) return;
  padMap.frame(gp);
  if (padMap.waiting()) return; // (the controller page is waiting for a button to map)
  const hit = (id) => padMap.hit(id), down = (id) => padMap.down(id);
  const { move, aim } = padMap.sticks(gp);
  if (!started) {
    if (padMap.newly.size) {
      start();
      showHelp("pad");
    }
    return;
  }
  zone.pad(gp, padMap);
  // squared response: fine aim near the centre, full speed at the rim
  const rx = stick(aim[0]), ry = stick(aim[1]);
  look(rx * Math.abs(rx) * dt, ry * Math.abs(ry) * dt * 0.75, PAD_LOOK * sensitivity);
  if (zone.seated) {
    // at the well the pad plays; the look stick still looks round
    if (helpMode !== "pad" && (rx || ry || padMap.now.size)) showHelp("pad");
    return;
  }
  // the plugins first, with their own actions (a press they take is not flying's too: see PadMap.take)
  if (!map.open) for (const p of plugins) p.pad?.(padMap);
  pad.x = stick(move[0]);
  pad.y = stick(move[1]);
  pad.rise = padMap.value(gp, "rise") - padMap.value(gp, "sink");
  pad.surge = down("surge");
  if (hit("slower")) changeSensitivity(1 / 1.1);
  if (hit("faster")) changeSensitivity(1.1);
  if (hit("invert")) toggleInvert();
  if (hit("mute")) toggleMute();
  if (hit("interact")) interact();
  if (hit("autofly")) toggleAutofly();
  if (hit("levelOut")) levelOut();
  if (pad.y > 0.5) toggleAutofly(false); // pulling back stops it
  if (hit("map")) map.toggle();
  if (hit("open")) marderchen.museum.toggle();
  if (hit("layerUp")) map.shift(1);
  if (hit("layerDown")) map.shift(-1);
  if (!map.open) pad.roll = (down("rollLeft") ? 1 : 0) - (down("rollRight") ? 1 : 0);
  if (helpMode !== "pad" && (pad.x || pad.y || rx || ry || pad.rise)) showHelp("pad");
}

// The controller's interact button: what you are with is opened or entered (a museum piece, the well
// beside you, a plugin's post or thread: its interact hook); with nothing there, the view is recentred.
function interact() {
  if (marderchen.museum.open || marderchen.museum.canOpen()) return marderchen.museum.toggle();
  if (zone.nearWell && !zone.seated) return zone.sit();
  if (hook("interact")) return;
  levelOut();
}

// the controller page of the Tab panel: each action and the buttons it is on (see pad.js)
padMap.bindPanel($("padPanel"), () => padIndex !== null && !!navigator.getGamepads?.()[padIndex]?.connected);
$("mPad").addEventListener("click", () => {
  const open = document.body.classList.toggle("padding");
  $("mPad").classList.toggle("on", open);
  if (!open) padMap.cancel();
});
padMap.onSaved = () => showHelp();
window.addEventListener("gamepadconnected", () => {
  if (!started) $("prompt").textContent = "click or press any button to materialize";
});

// touch: drag to look, hold a second finger to fly forward
const touches = new Map();
window.addEventListener("touchstart", (e) => {
  start();
  for (const t of e.changedTouches) touches.set(t.identifier, [t.clientX, t.clientY]);
  touchThrust = touches.size > 1 ? 1 : 0;
}, { passive: true });
window.addEventListener("touchmove", (e) => {
  const t = e.changedTouches[0], last = touches.get(t.identifier);
  if (last) look(t.clientX - last[0], t.clientY - last[1], 0.005 * sensitivity);
  for (const c of e.changedTouches) touches.set(c.identifier, [c.clientX, c.clientY]);
}, { passive: true });
const touchEnd = (e) => {
  for (const t of e.changedTouches) touches.delete(t.identifier);
  touchThrust = touches.size > 1 ? 1 : 0;
};
window.addEventListener("touchend", touchEnd);
window.addEventListener("touchcancel", touchEnd);
if (matchMedia("(pointer: coarse)").matches) $("prompt").textContent = "tap to materialize · drag to look · two fingers to fly";

const RISE_RAMP = 1.2; // seconds of holding space to reach the full faster climb
let riseHold = 0;
function fly(dt) {
  const axis = (pos, neg) => (keys.has(pos) ? 1 : 0) - (keys.has(neg) ? 1 : 0);
  // aim first, so thrust follows where the camera points this frame
  const ease = 1 - Math.exp(-LOOK_EASE * dt);
  viewYaw += (yaw - viewYaw) * ease;
  viewPitch += (pitch - viewPitch) * ease;
  roll += (axis("KeyQ", "KeyE") + pad.roll) * ROLL * dt; // Q rolls left, E right
  viewRoll += (roll - viewRoll) * (1 - Math.exp(-8 * dt));
  if (levelling > 0) {
    levelling -= dt;
    marderchen.roll *= Math.exp(-8 * dt);
    zone.roll *= Math.exp(-8 * dt);
    for (const p of plugins) if (p.roll) p.roll *= Math.exp(-8 * dt);
  }
  camera.rotation.set(viewPitch, viewYaw, viewRoll + marderchen.roll + zone.roll + plugins.reduce((sum, p) => sum + (p.roll ?? 0), 0));
  if (zone.seated) {
    // sitting at the well: the seat holds you, and only the view moves
    autofly = false;
    camera.position.lerp(zone.seat, 1 - Math.exp(-4 * dt));
    velocity.multiplyScalar(Math.exp(-6 * dt));
    return;
  }

  thrust.set(axis("KeyD", "KeyA") + pad.x, 0, axis("KeyS", "KeyW") + pad.y - touchThrust - (autofly ? 1 : 0));
  thrust.applyEuler(camera.rotation);
  thrust.y += axis("Space", "KeyC") - (keys.has("ControlLeft") ? 1 : 0) + pad.rise;
  if (thrust.lengthSq() > 1) thrust.normalize();
  const forward = thrust.dot(camera.getWorldDirection(ahead));
  if (forward > 0) thrust.addScaledVector(ahead, forward * (AHEAD - 1));
  const surge = keys.has("ShiftLeft") || keys.has("ShiftRight") || pad.surge ? SURGE * (hyper ? HYPER : 1) : 1;
  velocity.addScaledVector(thrust, THRUST * surge * dt);
  // holding space: the climb picks up the longer it is held, up to 1.6 times (a tap stays gentle)
  riseHold = keys.has("Space") ? Math.min(riseHold + dt, RISE_RAMP) : 0;
  velocity.y += THRUST * surge * dt * 0.6 * (riseHold / RISE_RAMP);
  velocity.addScaledVector(marderchen.museum.current, dt); // the museum's vortex pulls gently onward
  velocity.addScaledVector(marderchen.pull, dt);           // and the portal at his door pulls hard
  velocity.addScaledVector(zone.pull, dt);                 // as does the ring down to the zone
  for (const p of plugins) if (p.pull) velocity.addScaledVector(p.pull, dt); // and whatever a plugin pulls you with
  velocity.multiplyScalar(Math.exp(-DRAG * dt));
  // a plugin flying you somewhere: steered there, and turned to it
  // Shift on the way hurries the flight (twice tapped: more)
  const hurry = surge > 1 ? (hyper ? 4 : 2.5) : 1;
  const steer = hook("steer", camera, dt, hurry);
  if (steer) {
    velocity.lerp(steer.velocity, 1 - Math.exp(-3 * (steer.hurry ?? 1) * dt));
    if (steer.look) face(steer.look.yaw, steer.look.pitch);
  }
  camera.position.addScaledVector(velocity, dt * world.slow);
  // things are solid: you bounce off them (twice over, for corners)
  let impact = 0;
  for (let pass = 0; pass < 2; pass++) impact = Math.max(impact, world.collide(camera.position, velocity, BODY), zone.collide(camera.position, velocity, BODY), ...plugins.map((p) => p.collide?.(camera.position, velocity, BODY) ?? 0));
  bumpIn -= dt;
  if (impact > 40 && bumpIn <= 0) {
    audio.bump(Math.min(1, impact / 700));
    bumpIn = 0.12;
  }
}

// before the first click the camera circles the origin
function idle(t) {
  const a = t * 0.06;
  camera.position.set(Math.sin(a) * 520, 95 + Math.sin(t * 0.1) * 30, Math.cos(a) * 520);
  camera.lookAt(0, 0, 0);
}

let elapsed = 0, last = performance.now(), coordsTimer = 0, seatedBefore = false;
renderer.setAnimationLoop((now) => {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  elapsed += dt;
  pollPad(dt);
  if (!started) { idle(elapsed); for (const p of plugins) p.idle?.(dt); } // (what they have in the hub moves behind the start screen too)
  else if (!marderchen.museum.open && !hook("busy")) fly(dt); // a piece is open: stay where you are
  const heard = audio.features(dt);
  world.G.uBass.value = heard.bass; world.G.uMid.value = heard.mid; world.G.uHigh.value = heard.high; world.G.uBeat.value = heard.beat;
  // in the zone the pieces stand steady: the music does not brighten or flash their edges
  if (world.realm === ZONE) world.G.uMid.value = world.G.uBeat.value = 0;
  world.update(dt, camera);
  if (started) {
    marderchen.update(dt, camera, keys.has("ShiftLeft") || keys.has("ShiftRight") || pad.surge);
    zone.update(dt, camera, velocity);
    for (const p of plugins) p.update?.(dt, camera);
    voice.update(dt, velocity.length(), $("entity").classList.contains("show"));
    if (zone.seated !== seatedBefore) {
      seatedBefore = zone.seated;
      document.body.classList.toggle("seated", zone.seated);
      showHelp();
    }
    // the entity does not follow into marderchen's dimension
    if (world.realm === "void" && !marderchen.mad) entity.update(dt, camera, velocity.length()); // nor does it show itself while he is out
    else audio.entityVoice(0, 0); // and its hum does not follow you out (left humming, it buzzed on in every other dimension)
    entity.meddle(dt); // (its ways with the sound reach everywhere)
  }
  fadeEl.style.opacity = Math.max(marderchen.fade, zone.fade, ...plugins.map((p) => p.fade ?? 0)).toFixed(3); // the dark at any door
  world.sky.render(renderer, camera);
  if (document.visibilityState === "visible") adaptResolution(dt);
  audio.setSpeed(velocity.length());
  // the lens widens a little at speed, and narrows (zooms in) while the right button is held
  const zooming = rightHeld && performance.now() - rightHeld > ZOOM_AFTER * 1000;
  const fov = (70 + Math.min(velocity.length() / 500, 1) * 18) * (zooming ? ZOOM : 1);
  if (Math.abs(fov - camera.fov) > 0.05) {
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 4);
    camera.updateProjectionMatrix();
  }
  screen.update(dt);
  composer.render(dt);
  if (map.open) map.draw(camera, viewYaw, world.realm);
  // where you are: the sector's grid coordinates, then your offset from its centre in units
  if ((coordsTimer -= dt) <= 0) {
    coordsTimer = 0.15;
    const p = camera.position, cell = (v) => Math.round(v / CELL), off = (v) => Math.round(v - cell(v) * CELL);
    const signed = (n) => (n < 0 ? "−" : "+") + Math.abs(n);
    $("coords").textContent = `${realmNames[world.realm] ? `${realmNames[world.realm]} · ` : ""}sector ${cell(p.x)}, ${cell(p.y)}, ${cell(p.z)} · offset ${signed(off(p.x))} ${signed(off(p.y))} ${signed(off(p.z))}`;
  }
});

window.cvoid = { world, camera, renderer, entity, marderchen, zone, voice, map, plugins, padMap, CELL, aim(y, p) { yaw = viewYaw = y; pitch = viewPitch = p; } };

// The plugins (see the top), installed once the game around them is ready: what they are given.
const game = {
  scene, world, audio, map, camera, canvas, velocity, keys, stored, store,
  pad: padMap, // the controller's buttons, as mapped (see pad.js): a plugin may add actions of its own
  arrive, face, note, lockPointer, levelOut, showHelp: () => showHelp(),
  started: () => started,
  aiming,                                   // flying, the pointer held, no map open
  mapOpen: () => map.open,
  closeMap: (lock = true) => { if (map.open) map.toggle(); if (lock) lockPointer(); }, // (lock false: something else takes the screen)
  // how the picture is finished while in a dimension of its own (null: as cvoid's own): tone mapped
  // or not (a page's colours shown as they are), and how much light glows
  finish(look) {
    renderer.toneMapping = look?.toneMapped === false ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    bloom.strength = look?.bloom ?? BLOOM;
  },
  // a dimension of its own: its name, the letter its places are kept under, what it is called, and
  // what stands in each of its sectors
  addRealm(name, letter, title, spec) {
    addRealm(name, `${letter}:`, spec);
    map.addRealm(name, letter, title);
    realmNames[name] = title;
  },
};
for (const url of await fetch("/api/plugins").then((r) => (r.ok ? r.json() : [])).catch(() => [])) {
  try {
    plugins.push((await import(url)).default(game) ?? {});
  } catch (err) {
    console.warn(`[cvoid] the plugin ${url} could not be loaded:`, err);
  }
}
showHelp();
