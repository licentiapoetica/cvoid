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
import { Back, BACK_HOLE, NAME as COMPANION } from "./back.js";
import { Meteors } from "./meteors.js";
import { Lasers } from "./laser.js";
import { Goo } from "./goo.js";
import { Forming } from "./forming.js";
import { PadMap } from "./pad.js";
import { SPAWN, setPortals, hubSlot, portalNames } from "./constants.js";
import { draggablePanels } from "./panels.js";
import { Locks } from "./locks.js";
import { Slots } from "./slots.js";

const $ = (id) => document.getElementById(id);
const canvas = $("view");

// with an alpha channel: opaque everywhere, but a plugin may cut a hole in the picture to show
// something it places behind it (a page, say), which what hangs in front then hides as it should
// (no antialiasing of its own: the picture is drawn through the passes below, which it never reached;
// the graphics panel's smooth edges are the passes' own)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", alpha: true });
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

// The graphics panel's choices (Tab), remembered: resolution (auto follows the frame rate), a cap on the
// frame rate and whether frames keep time with the screen (vsync), the glow, smooth edges, how many videos play at once in the plugins' dimensions, and how
// the view follows the mouse
const gfx = {
  resolution: "auto", fps: 0, vsync: true, bloom: true, aa: false, videos: 3, loops: 2, ease: "normal",
  ...(() => { try { return JSON.parse(localStorage.getItem("vvoid.graphics")) ?? {}; } catch { return {}; } })(),
};
const meter = { frames: 0, time: 0, fps: 0 }; // frames a second, as drawn (shown in the graphics panel)
let rawInput = null; // whether the mouse comes raw (known once the pointer has been taken: see lockPointer)
const LOOK_EASES = { off: 0, light: 60, normal: 30, heavy: 14 }; // (higher: tighter; off: the view is where the mouse put it)
function applyGraphics() {
  bloom.enabled = gfx.bloom;
  const samples = gfx.aa ? 4 : 0;
  for (const target of [composer.renderTarget1, composer.renderTarget2]) {
    if (target.samples !== samples) { target.samples = samples; target.dispose(); } // (made again, so, at its next use)
  }
}
applyGraphics();

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
    : hook("status", spec) || "local noise · claude unreachable";
  const name = spec ? spec.name : "· · ·";
  hud.spec = spec;
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
const spawnAt = (() => { try { return JSON.parse(localStorage.getItem("vvoid.spawn")); } catch { return null; } })();
const world = new World(scene, renderer, { onSector, onSpec: (key, spec) => map.add(key, spec) });
for (const [key, spec] of world.specs) map.add(key, spec); // the hub and the two doors: fixed places, not what the cache remembers
map.load();

// Resolution follows the frame rate: a slow GPU gets fewer pixels instead of a stalled driver.
const MAX_RATIO = Math.min(window.devicePixelRatio, 1.5), MIN_RATIO = 0.5;
const RESOLUTIONS = { auto: null, "50%": 0.5, "75%": 0.75, "100%": 1, sharp: Math.min(window.devicePixelRatio, 2) };
let ratio = RESOLUTIONS[gfx.resolution] ?? MAX_RATIO;
// never drawn larger than the GPU can make a picture: past it the passes' targets are not made and
// the screen stays black (Firefox resisting fingerprinting allows only 2048, and says the screen is
// twice as dense as it is, so a wide window goes past it)
const gl = renderer.getContext();
const GPU_MAX = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), ...gl.getParameter(gl.MAX_VIEWPORT_DIMS));
const drawRatio = (w = window.innerWidth, h = window.innerHeight) => Math.min(ratio, GPU_MAX / w, GPU_MAX / h);
function resize() {
  const w = window.innerWidth, h = window.innerHeight, drawn = drawRatio(w, h);
  renderer.setPixelRatio(drawn);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(drawn);
  composer.setSize(w, h);
  screen.resize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  world.G.uPx.value = (drawn * h) / 900;
  map.resize();
}
// It goes by the typical frame (the median), not the average: one stall (a sector being built, a
// shader compiled) is not a slow machine, and dropping the resolution for it is a visible jump.
// A rise followed soon by another drop is the frame rate sitting at the edge: each such time it waits
// twice as long before trying again, rather than going up and down (every change is a hitch).
const pace = { time: 0, frames: [], hold: 0, clock: 0, raisedAt: -1e9, wait: 12 };
function adaptResolution(dt) {
  if (RESOLUTIONS[gfx.resolution]) return; // (a fixed one chosen)
  pace.clock += dt;
  pace.time += dt;
  pace.frames.push(dt);
  pace.hold -= dt;
  if (pace.time < 1.5) return;
  // (measured against the frames' own pace when a cap slows them on purpose: 30 a second is not a stall)
  const aim = frameAim() / 1000, frame = pace.frames.sort((a, b) => a - b)[pace.frames.length >> 1] * Math.min(1, (1 / 60) / aim);
  pace.time = 0;
  pace.frames = [];
  if (frame > 1 / 38 && ratio > MIN_RATIO) {
    ratio = Math.max(MIN_RATIO, ratio * 0.82);
    pace.wait = pace.clock - pace.raisedAt < 20 ? Math.min(pace.wait * 2, 300) : 12;
    pace.hold = pace.wait; // don't climb straight back into the stall
    resize();
  } else if (frame < 1 / 54 && ratio < MAX_RATIO && pace.hold <= 0) {
    ratio = Math.min(MAX_RATIO, ratio * 1.1);
    pace.raisedAt = pace.clock;
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
let padZoom = false; // the controller's zoom button (see pad.js) held: zoomed in, as with the right button
const AHEAD = 1.4; // flying forward (W) goes this much faster than sideways, back or up
// Shift surges; tapped twice quickly and held, it surges harder still, until it is let go
const HYPER = 3, DOUBLE_TAP = 300; // ms between the two taps
let lastShift = -Infinity, hyper = false;
const BODY = 14;  // how wide you are, for bumping into things
let bumpIn = 0;   // a knock is heard at most this often
const MOUSE_LOOK = 0.0016;  // radians per count of raw mouse movement
// how tightly the view follows the mouse (graphics panel: smoothing): it removes the stepping of low-rate
// mice; higher is tighter, 0 none at all
const lookEase = () => LOOK_EASES[gfx.ease] ?? 30;
const PAD_LOOK = 2.6;       // radians per second at full stick

const stored = (name, fallback) => {
  try { return JSON.parse(localStorage.getItem(`vvoid.${name}`)) ?? fallback; } catch { return fallback; }
};
const store = (name, value) => {
  try { localStorage.setItem(`vvoid.${name}`, JSON.stringify(value)); } catch { /* private mode */ }
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
// coming out of a portal (or sitting down somewhere): face this way and lose most of your speed
function arrive(toYaw, toPitch) {
  face(toYaw, toPitch);
  velocity.multiplyScalar(0.1);
}
const meteors = new Meteors({ scene, world }); // now and then a shooting star, far out in the void
const lasers = new Lasers({ scene, world });   // yours (a portal clicked, V) and, with the together plugin, the others'
const forming = new Forming({ scene, world }); // the portals round the clock whose plugins are still on their way
const goo = new Goo({ scene, world, storeEl: $("gooStore"), muzzle: (camera) => lasers.muzzle(camera) }); // J: shot at the post looked at (see goo.js)
// V (or the laser button on a touch screen): a shot straight ahead, into the dark
function fireLaser() {
  const from = lasers.muzzle(camera);
  lasers.shoot({ from, to: from.clone().addScaledVector(camera.getWorldDirection(new THREE.Vector3()), 2600) });
}
// the way back (see back.js): each place called by its dimension's name, and the room's in it
// (and the things round you, for it to look at now and then: the portals round the clock, or a dimension's ways out)
const back = new Back({ scene, world, textEl: $("irrlicht"), toOrigin: stored("irrlichtToOrigin", false), heading: () => yaw, music: () => audio.music,
  sights: () => world.realm === "void" ? portalNames().map((name) => new THREE.Vector3(...hubSlot(name).at)) : [].concat(hook("exit") ?? []).map((exit) => exit.at).filter(Boolean), name: (realm, room) => {
  const where = realm === "void" ? "the void" : realmNames[realm] ?? realm;
  return room ? `${where} · ${room.label ?? room.key}` : where;
} });
// ---- plugins: optional local additions, in plugins/<name>/ beside vvoid (kept out of its repository) ----
// The server says which there are (see server.js); each one's client.js default-exports install(vvoid),
// given the pieces of the game it may use (see the end of this file), and returns its hooks, all
// optional: update(dt, camera) each frame of flight · idle(dt) before it starts · busy() something of
// its own is open (flight and the keys wait) · key(e) / mouse(e) / rightClick() / wheel(e): true when
// it took it · look(dx, dy) you turned the view · autofly(on): true (or a note) when it flies for you
// its own way · steer(camera, dt, hurry): where to go and look · pull, roll, fade: its pull on you, its
// tilt, the dark at its door · collide(position, velocity, radius) · status(spec): the HUD's line for
// its sectors · target(): what R turns you to · notice(): what you are with (for the void's voice) ·
// leaveRealm / enterRealm(realm, camera): going there by the map · help: its keys, for the help line ·
// interact(): the controller's interact button, true when it opened or entered something of its own ·
// pad(pad): the controller each frame of flight, before vvoid's own buttons (its own actions: pad.addActions) ·
// hold(): a reason, while it keeps you where you are (no portal, no way back, no jump by the map) ·
// seat(): { at, title, keys, pad } while it holds you in a seat (at: where; the view still turns; its keys
// stay on the screen) · level(): true when R turned you its own way · quiet(): true while the entity
// keeps away · and, asked of every plugin: keyUp(e), pointer(locked) (the pointer taken or let go),
// jump() (you are put somewhere at once, by the map or the way back), gamepad(gp, pad) (the controller
// each frame, seated or not)
const plugins = [];
const hook = (name, ...args) => {
  for (const p of plugins) {
    const answer = typeof p[name] === "function" ? p[name](...args) : null;
    if (answer) return answer;
  }
  return null;
};
const realmNames = {}; // for the HUD (the plugins add their dimensions)
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
// the graphics panel (Tab): each choice at once, and remembered
const keepGraphics = () => store("graphics", gfx);
function choices(id, options, key, label = (v) => String(v), after = () => {}) {
  const buttons = options.map((value) => {
    const b = Object.assign(document.createElement("button"), { textContent: label(value) });
    b.onclick = () => { gfx[key] = value; keepGraphics(); after(); show(); };
    $(id).append(b);
    return [value, b];
  });
  const show = () => { for (const [value, b] of buttons) b.classList.toggle("on", gfx[key] === value); };
  show();
}
choices("gRes", Object.keys(RESOLUTIONS), "resolution", undefined, () => { ratio = RESOLUTIONS[gfx.resolution] ?? MAX_RATIO; pace.hold = 3; resize(); showNow(); });
choices("gFps", [0, 120, 60, 30], "fps", (v) => (v ? String(v) : "no cap"), runFrames);
choices("gVsync", [true, false], "vsync", (v) => (v ? "on" : "off"), runFrames);
choices("gBloom", [true, false], "bloom", (v) => (v ? "on" : "off"), applyGraphics);
choices("gAA", [false, true], "aa", (v) => (v ? "on" : "off"), applyGraphics);
choices("gVideos", [1, 2, 3, 6], "videos");
choices("gLoops", [2, 4, 6, 10], "loops");
choices("gEase", Object.keys(LOOK_EASES), "ease");
function showNow() {
  const w = Math.round(innerWidth * drawRatio()), h = Math.round(innerHeight * drawRatio());
  $("gNow").textContent = `now ${Math.round(meter.fps)} frames a second${gfx.vsync ? "" : " · vsync off"} · drawn at ${w} × ${h}${RESOLUTIONS[gfx.resolution] ? "" : " (auto)"}`;
  $("gFpsNow").textContent = `·  ${Math.round(meter.fps)} fps`; // (and in its title, plainly)
}
function showSensitivity() {
  $("gSens").value = Math.log(sensitivity).toFixed(2);
  $("gSensOut").textContent = `${sensitivity.toFixed(2)}×`;
}
$("gSens").addEventListener("input", () => {
  sensitivity = THREE.MathUtils.clamp(Math.exp(Number($("gSens").value)), 0.2, 5);
  store("sensitivity", sensitivity);
  $("gSensOut").textContent = `${sensitivity.toFixed(2)}×`;
});
for (const type of ["keydown", "keyup"]) $("gSens").addEventListener(type, (e) => e.stopPropagation()); // (its arrow keys are its own)
// The field of view: as wide as asked, across, as games give it (Counter-Strike's 90), whatever shape the
// window is; unset, vvoid's own (70 up and down). The lens still widens at speed and narrows zoomed in,
// from there; and the mouse turns the view as far for the same push, however wide it is.
const OWN_TALL = 70;
const tallFor = (across) => THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(across) / 2) / camera.aspect));
const acrossFor = (tall) => THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(tall) / 2) * camera.aspect));
const baseFov = () => (gfx.fov ? tallFor(gfx.fov) : OWN_TALL);
function showFov() {
  const across = gfx.fov ?? Math.round(acrossFor(OWN_TALL));
  $("gFov").value = across;
  $("gFovOut").textContent = `${Math.round(across)}°${gfx.fov ? "" : " (vvoid's)"}`;
}
$("gFov").addEventListener("input", () => { gfx.fov = Number($("gFov").value); keepGraphics(); showFov(); });
$("gFov").addEventListener("dblclick", () => { delete gfx.fov; keepGraphics(); showFov(); }); // (double clicked: back to vvoid's own)
for (const type of ["keydown", "keyup"]) $("gFov").addEventListener(type, (e) => e.stopPropagation());
window.addEventListener("resize", showFov); // (across, at the window's new shape)
showFov();
function showRaw() {
  $("gRaw").textContent = rawInput === null ? "raw input: known once the pointer is taken"
    : rawInput ? "raw input: yes (the mouse as it moves, no acceleration)"
    : "raw input: not in this browser, so the system's pointer acceleration applies (turn it off there for an even feel, and lower the smoothing)";
}
showSensitivity();
showRaw();
const fadeEl = $("fade");
let veil = 0; // the dark a jump happens in, lifting (see teleport)

// Going somewhere at once, from the map: in the dark, into whichever dimension the place is in.
// (Its ways in and out are not refused while it goes: see vvoid.held.)
let moving = false;
function teleport(realm, x, y, z) {
  pushed = null;
  for (const p of plugins) p.jump?.();
  if (world.realm !== realm) {
    moving = true;
    try {
      hook("leaveRealm", world.realm, camera); // back out to the void first
      hook("enterRealm", realm, camera);
    } finally {
      moving = false;
    }
  }
  camera.position.set(x, y, z);
  velocity.set(0, 0, 0);
  autofly = false;
  veil = Math.max(veil, 1.1); // the jump happens in the dark, which lifts
}
// Somewhere at once, in the dark that lifts: out of the room you are in if it is left behind, into the
// place's dimension, its room ({ key, label } of the viewer that dimension is: see the f0ck plugin), and
// there, facing as given. The way back's places carry their viewer, and are always put back in its room;
// anyone else's (a group's leader's: see the together plugin) only when it is another room.
function goTo(place) {
  if (lockedOut(place.realm, () => goTo(place))) return; // (its password first)
  stopFlying();
  const from = back.where();
  if (from.viewer && from.realm !== place.realm && from.room) from.viewer.exitRoom(false);
  teleport(place.realm, place.position.x, place.position.y, place.position.z);
  if (place.viewer) place.viewer.backTo(place.room);
  else if (place.realm !== from.realm || (place.room?.key ?? null) !== (from.room?.key ?? null)) back.where().viewer?.backTo(place.room ?? null);
  face(place.yaw, place.pitch);
}
// Through the way back (see back.js): where you were, facing as you faced
function goBack() {
  if (held()) return;
  const place = back.take();
  if (!place) return;
  goTo(place);
  audio.sting();
  note(place.origin ? `${COMPANION} takes you to the origin` : `${COMPANION} takes you back to ${place.name}`);
}
// Irrlicht right clicked (or long pressed): to the origin from now on, or back again (remembered)
function turnBack() {
  const toOrigin = back.turn();
  store("irrlichtToOrigin", toOrigin);
  note(toOrigin ? `${COMPANION} takes you to the origin now · right click: back` : `${COMPANION} takes you back now · right click: to the origin`);
}
// A plugin keeping you where you are (the together plugin's group, whose members go only where its leader
// goes): no portal, no way back, no jump by the map. Its reason is said instead, and returned.
function held(say = note) {
  const why = hook("hold");
  if (why) say(why);
  return why;
}
// A portal into a plugin behind a password (see locks.js), asked by every way into one of its dimensions:
// true when it does not take you yet. The password is put on the screen; given, `retry` takes you
// through after all; turned away (Esc), you are put back before its ring in the hub, facing into it, past
// its pull, pushed out of it slowly (see pushOut). Never while you are in one of its own dimensions
// already, or being put somewhere.
const realmOwner = {}; // dimension -> the plugin it is of
// still, and nothing held: no keys (their letting go may never come: the gate takes them), no autofly,
// no flight into a portal, no surge
function becalm() {
  stopFlying();
  keys.clear();
  hyper = false;
  velocity.set(0, 0, 0);
}
const TURNED_AWAY = 1000; // how far before its ring a refused traveller is put (its pull reaches 900)
const PUSHED_FOR = 1.6;   // s, the push out of it, easing to a stop
let pushed = null;        // { from, to, t }: being pushed back out of a locked portal (see pushOut)
// The gate let go: the pointer is taken back at once, but a browser takes it only after a gesture, and Esc
// is not one (Enter is). Turned away by Esc, the first key after it (or a click) gives you the view again.
let relock = false;
function lockedOut(realm, retry, look = {}) {
  const name = realmOwner[realm];
  if (moving || !name || !locks.locked(name) || realmOwner[world.realm] === name) return false;
  becalm();
  if (locks.asking) return true;
  if (map.open) map.toggle();
  locks.ask(name, { title: realmNames[realm] ?? name, ...look }).then((opened) => {
    becalm(); // (again: a key let go while the gate had the keys never reached the flight)
    relock = true;
    if (opened) retry?.();
    else if (world.realm === "void" && portalNames().includes(name)) {
      const slot = hubSlot(name), at = new THREE.Vector3(...slot.at);
      if (camera.position.distanceTo(at) < 2500) pushed = { from: camera.position.clone(), to: at.addScaledVector(new THREE.Vector3(...slot.in), TURNED_AWAY), t: 0 };
    }
    lockPointer();
  });
  return true;
}
// A wrong password: the void answers it. Everything shudders, the dark closes a moment, its sound sags
// under a knock, and it says so; then the gate closes and the ring pushes you out (as Esc does).
const REFUSALS = ["no", "not you", "that is not the word", "it does not know you", "it stays shut", "try to remember"];
const SHUDDER_FOR = 0.9; // s
let shudder = 0; // s of it left
function refused() {
  shudder = SHUDDER_FOR;
  veil = Math.max(veil, 0.55);
  audio.refuse();
  const line = voice.fresh(REFUSALS);
  if (!voice.say(line)) note(line);
}
// No password given at all (Esc): the void answers that too, more quietly. It breathes out as the ring
// lets you go, the dark dims a little, the view sways once, slowly, as if it turned from you, and it
// says so (but not after a wrong password: that was answered already, see refused).
const DECLINES = ["then not", "another time, perhaps", "it will keep", "as you like", "the door stays where it is", "noted. not today", "you did not say it", "it will ask again"];
const SWAY_FOR = 2.4; // s
let sway = 0; // s of it left
function declined() {
  sway = SWAY_FOR;
  veil = Math.max(veil, 0.3);
  audio.sigh();
  const line = voice.fresh(DECLINES);
  if (!voice.say(line)) note(line);
}
// how far the view is thrown this frame (pitch, yaw, roll), dying away: refused, a shudder; declined, one
// slow sway
function shaken(dt) {
  let qx = 0, qy = 0, qz = 0;
  const t = performance.now() / 1000;
  if (shudder > 0) {
    shudder = Math.max(0, shudder - dt);
    const k = (shudder / SHUDDER_FOR) ** 2 * 0.03;
    qx += Math.sin(t * 61) * k; qy += Math.sin(t * 47 + 1) * k * 0.6; qz += Math.sin(t * 53 + 2) * k * 1.4;
  }
  if (sway > 0) {
    sway = Math.max(0, sway - dt);
    const u = 1 - sway / SWAY_FOR, k = Math.sin(Math.PI * u) * 0.022; // (in and out once, smoothly)
    qx -= k * 0.4; qz += Math.sin(u * Math.PI * 2) * k;
  }
  return [qx, qy, qz];
}
// whose dimension you are in: left, a password not remembered is let go (asked again next time: see locks.js)
let inOf = null;
function leftLocked() {
  const owner = realmOwner[world.realm] ?? null;
  if (owner === inOf) return;
  if (inOf) locks.left(inOf);
  inOf = owner;
}
// each frame of it: the ring lets you go, backwards, still facing it, fast at first and slowing to a stop
// (what you do meanwhile does not move you; the ring's dark lifts as you leave it)
function pushOut(dt) {
  if (!pushed) return;
  if (world.realm !== "void") return void (pushed = null);
  pushed.t = Math.min(1, pushed.t + dt / PUSHED_FOR);
  camera.position.lerpVectors(pushed.from, pushed.to, 1 - (1 - pushed.t) ** 3);
  velocity.set(0, 0, 0);
  if (pushed.t === 1) pushed = null;
}
map.bind({
  spawn: spawnAt,
  onGo(realm, x, y, z) {
    if (held((why) => map.note(why))) return;
    if (lockedOut(realm, () => this.onGo(realm, x, y, z))) return; // (its password first)
    if (realm === "void" && x === SPAWN[0] && y === SPAWN[1] && z === SPAWN[2]) spawnHere(); // (the origin: looking at the clock)
    else teleport(realm, x, y, z);
    if (map.open) map.toggle(); // and you see where you are
    lockPointer();
  },
  onSpawn: (spawn) => store("spawn", spawn),
});

const HELP = {
  keys: "mouse look · w a s d fly · q e roll · enter autofly · space / c rise, sink · shift surge (twice: faster) · r level out · v laser · j goo · - = volume · f fullscreen · tab map · b listen to the room · [ ] sensitivity · h keep hud · m mute · hold right zoom",
  get pad() { return padMap.help("flight"); }, // (as the buttons are mapped: see pad.js)
};
let helpMode = "keys", noteTimer = 0, wakeTimer = 0;
// The keys, in the Tab panel: vvoid's own (the keyboard's or the gamepad's, whichever was used last),
// then each plugin's ("in f0ck: e open · ..."), every one a key and what it does. Held in a plugin's
// seat (a game: see the seat hook), its keys come first, and stay on the screen as well.
function showHelp(mode = helpMode) {
  helpMode = mode;
  const theirs = mode === "keys" ? plugins.map((p) => p.help).filter(Boolean) : [];
  const groups = [[mode === "pad" ? "gamepad" : "vvoid", HELP[mode]], ...theirs.map((help) => {
    const [, of, keys] = help.match(/^in ([^:]+):\s*(.*)$/) ?? [null, "", help];
    return [of, keys];
  })];
  const seat = hook("seat"), play = seat && (mode === "pad" ? seat.pad : seat.keys);
  if (seat) groups.unshift([`${seat.title}${mode === "pad" ? ", gamepad" : ""}`, play]);
  const blocks = groups.map(([of, keys]) => {
    const title = Object.assign(document.createElement("div"), { className: "of", textContent: of });
    const list = Object.assign(document.createElement("div"), { className: "keys" });
    for (const [key, what] of entries(keys)) {
      list.append(Object.assign(document.createElement("b"), { textContent: key }), Object.assign(document.createElement("span"), { textContent: what }));
    }
    return [title, list];
  });
  // the first group (vvoid's own, or the seat's) a column of its own; the rest beside it
  const column = () => Object.assign(document.createElement("div"), { className: "column" }), left = column(), right = column();
  left.append(...blocks[0]);
  right.append(...blocks.slice(1).flat());
  $("keysList").replaceChildren(left, ...(blocks.length > 1 ? [right] : []));
  $("help").textContent = seat ? entries(play).map((entry) => entry.join(" ")).join(" · ") : "";
  const status = hud.spec && hook("status", hud.spec); // (a plugin's line may name the keys or the buttons)
  if (status) $("status").textContent = status;
}
// A help line as its entries, [keys, what they do]: the controller's come so already (see PadMap.help);
// "w a s d fly" is split at the first word that is not a key on its own
function entries(keys) {
  if (Array.isArray(keys)) return keys;
  return keys.split(" · ").map((entry) => {
    const words = entry.split(" "), at = Math.max(1, words.findIndex((w, i) => i > 0 && w.length > 2 && !/^(shift|ctrl|enter|space|tab|right|left|click|wheel|esc|backspace|arrows|stick|sticks|left-stick|right-stick|d-pad|triggers|bumpers|select|start)$/.test(w)));
    return [words.slice(0, at).join(" "), words.slice(at).join(" ")];
  });
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

// The crosshair goes when you have been still a while (watching a post, say, or on tour: nothing looked
// round, no key, no button), and is back at once with the next of any of them
const STILL = 3; // seconds
let stirred = 0;
function stir() { stirred = performance.now(); }
for (const type of ["keydown", "mousedown", "wheel", "touchstart"]) window.addEventListener(type, stir, { passive: true });

// Free look: nothing stops at straight up or straight down. Keep pulling back and you go over the
// top and fly on upside down. While you are upside down, left and right are swapped back so that
// moving the mouse left still turns the view left.
function look(dx, dy, scale) {
  if (dx || dy) stir();
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
  showSensitivity();
  note(`look sensitivity × ${sensitivity.toFixed(2)}`);
}
function toggleInvert() {
  invertY = !invertY;
  store("invertY", invertY);
  note(`vertical look ${invertY ? "inverted" : "normal"}`);
}
// R: level out. Upright again, the horizon level and no tilt left from a portal, still heading the
// way you were going (upside down over the top, that is the other way round), or as a plugin turns you.
let levelling = 0;
function levelOut() {
  levelling = 0.8;
  const turns = Math.round(roll / (Math.PI * 2)) * Math.PI * 2; // whole turns are unwound at once: the short way back to level
  viewRoll -= turns;
  roll = 0;
  if (hook("level")) return;
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
  if (!on) portalFlight = null; // (a flight into a portal, stopped with it)
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

// The traveller's name, on the start screen: optional, remembered, and theirs to type (no key in it flies,
// and a click in it does not start). Enter materializes. Plugins ask for it with player().
let playerName = stored("player", "");
{
  const field = document.querySelector("#start .player input");
  field.value = playerName;
  field.addEventListener("input", () => { playerName = field.value.trim(); store("player", playerName); });
  for (const type of ["click", "pointerdown"]) field.addEventListener(type, (e) => e.stopPropagation());
  field.addEventListener("keyup", (e) => e.stopPropagation());
  field.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.code === "Enter" || e.code === "NumpadEnter") { field.blur(); start(); lockPointer(); }
  });
}

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

// the start screen's count of who is in, and the line when the void is full (VVOID_MAX_SLOTS: see slots.js)
const slots = new Slots(() => start());

function start() {
  if (started) return;
  if (!slots.enter()) return; // (full: in line, and in by itself when a slot comes free)
  started = true;
  // take over from the idle orbit without a jump
  yaw = viewYaw = camera.rotation.y;
  pitch = viewPitch = camera.rotation.x;
  audio.start();
  // a chosen place to start, set on the map; else right where the start screen's turning view is, as it
  // is (no jump: you simply take over), in the hub, looking at the clock
  if (map.spawn) teleport(map.spawn.realm, map.spawn.x, map.spawn.y, map.spawn.z);
  map.visit(world.currentKey); // where you begin counts as explored
  voice.arrived(); // (someone it knows, it greets)
  if (playerName) back.greet(playerName); // (and Irrlicht, by the name given on the start screen)
  $("start").classList.add("gone");
  document.querySelector("#start .player input").blur(); // (started some other way, a key must fly, not type)
  $("hud").classList.add("on");
  $("crosshair").classList.add("on", "woken"); // (there at once: the moment you are in, you can aim)
  document.body.classList.add("started"); // (the touch screen's menu button shows from now: see index.html)
  wakeHud(9); // where you begin, named a while (with the HUD's slow first reveal)
}
// the Tab panel, on a touch screen: its button opens it and closes it again
$("laserButton").addEventListener("click", () => { if (started) fireLaser(); });
$("menuButton").addEventListener("click", () => {
  map.toggle();
  $("menuButton").textContent = map.open ? "close" : "menu";
});
new MutationObserver(() => { $("menuButton").textContent = map.open ? "close" : "menu"; }).observe(document.body, { attributes: true, attributeFilter: ["class"] });

// Raw mouse input where the browser offers it: the OS pointer acceleration curve
// is what makes locked-pointer look feel slippery.
async function lockPointer() {
  if (!started || !canvas.requestPointerLock || document.pointerLockElement === canvas) return; // (in line, the pointer stays free)
  try {
    await canvas.requestPointerLock({ unadjustedMovement: true });
    rawInput = !/firefox/i.test(navigator.userAgent); // (Firefox takes the option without a word, and gives no raw input)
  } catch (err) {
    if (err.name === "NotSupportedError") { rawInput = false; canvas.requestPointerLock()?.catch?.(() => {}); }
  }
  showRaw();
}

$("start").addEventListener("click", () => {
  start();
  lockPointer();
});
canvas.addEventListener("click", lockPointer);
document.addEventListener("pointerlockchange", () => {
  skipMoves = 2;
  if (document.pointerLockElement === canvas) relock = false;
  // Esc (the browser takes it to let go of the pointer, and the page never hears it): a plugin's game
  // pauses, and taking the pointer again (a click) goes on
  for (const p of plugins) p.pointer?.(document.pointerLockElement === canvas);
});
let skipMoves = 0;
document.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== canvas) return;
  // the first events after locking, and occasional huge deltas some browsers emit, would snap the view
  if (skipMoves > 0) return void skipMoves--;
  if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
  look(e.movementX, e.movementY, MOUSE_LOOK * sensitivity * (camera.fov / baseFov())); // zoomed in, the view turns as much less
});
window.addEventListener("keydown", (e) => {
  // Ctrl is down (descending) while flying: Ctrl+D, Ctrl+S, Ctrl+A... are the game's keys, not the
  // browser's bookmark, save and select (Ctrl+W it won't give up, see below; the text fields stop their own keys)
  if (started && (e.ctrlKey || e.metaKey) && /^(Key|Digit)/.test(e.code)) e.preventDefault();
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
  // a plugin's own keys (or all of them, while something of its own is open)
  if (hook("key", e)) return;
  if (!e.repeat) {
    if (helpMode !== "keys") showHelp("keys");
    if (e.code === "KeyM") toggleMute();
    if (e.code === "Minus" || e.code === "NumpadSubtract") setVolume(audio.volume - 0.1, true);
    if (e.code === "Equal" || e.code === "NumpadAdd") setVolume(audio.volume + 0.1, true);
    if (e.code === "Enter" || e.code === "NumpadEnter") toggleAutofly();
    if (e.code === "KeyS") toggleAutofly(false);
    if (e.code === "KeyH") note(document.body.classList.toggle("hud-shown") ? "hud kept" : "hud comes and goes"); // the place's name kept on the screen, and let go again
    if (e.code === "KeyR") levelOut();
    if (e.code === "KeyV" && !e.repeat && started) fireLaser();
    if (e.code === "KeyJ" && started && !goo.shoot(camera)) note("nothing left · it gathers again"); // (see goo.js: its store)
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
  if (relock && !map.open && !locks.asking && e.code !== "Escape") lockPointer(); // (turned away at a gate: see relock)
  keys.add(e.code);
});
window.addEventListener("keyup", (e) => {
  keys.delete(e.code);
  if (!keys.has("ShiftLeft") && !keys.has("ShiftRight")) hyper = false;
  for (const p of plugins) p.keyUp?.(e);
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
  if (e.button === 0 && aiming()) {
    // a portal in the hub under the crosshair: flown into; else the click is the plugins'
    const portal = portalAimedAt();
    if (portal) return flyIntoPortal(portal);
    hook("mouse", e);
  }
});
document.addEventListener("mouseup", (e) => {
  if (e.button !== 2 || !rightHeld) return;
  const click = e.timeStamp - rightHeld < ZOOM_AFTER * 1000;
  rightHeld = 0;
  if (click && aiming()) {
    if (portalAimedAt()?.name === "back") return turnBack(); // (Irrlicht under the crosshair: where it takes you)
    hook("rightClick");
  }
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
const stick = (v) => v; // (the dead zone already taken out: see pad.js sticks)
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
  pad.surge = padZoom = false;
  const gp = activePad();
  if (!gp) return;
  padMap.frame(gp);
  const { move, aim } = padMap.sticks(gp); // (each past its dead zone, or nothing: a drifting stick is still)
  if (padMap.now.size || [...move, ...aim].some((v) => v !== 0)) stir();
  if (padMap.waiting()) return; // (the controller page is waiting for a button to map)
  const hit = (id) => padMap.hit(id), down = (id) => padMap.down(id);
  if (!started) {
    if (padMap.newly.size) {
      start();
      showHelp("pad");
    }
    return;
  }
  for (const p of plugins) p.gamepad?.(gp, padMap);
  // squared response: fine aim near the centre, full speed at the rim
  const rx = stick(aim[0]), ry = stick(aim[1]);
  look(rx * Math.abs(rx) * dt, ry * Math.abs(ry) * dt * 0.75, PAD_LOOK * sensitivity * (camera.fov / baseFov())); // (zoomed in, turning less, as the mouse does)
  if (hook("seat")) {
    // in a plugin's seat the pad plays; the look stick still looks round
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
  padZoom = down("zoom");
  if (hit("levelOut")) levelOut();
  if (pad.y > 0.5) toggleAutofly(false); // pulling back stops it
  if (hit("map")) map.toggle();
  if (hit("layerUp")) map.shift(1);
  if (hit("layerDown")) map.shift(-1);
  if (!map.open) pad.roll = (down("rollLeft") ? 1 : 0) - (down("rollRight") ? 1 : 0);
  if (helpMode !== "pad" && (pad.x || pad.y || rx || ry || pad.rise)) showHelp("pad");
}

// The controller's interact button: what you are with is opened or entered (a plugin's post, thread or
// piece: its interact hook); with nothing there, the view is recentred.
function interact() {
  if (hook("interact")) return;
  levelOut();
}

// the controller page of the Tab panel: each action and the buttons it is on (see pad.js)
padMap.bindPanel($("padPanel"), () => padIndex !== null && !!navigator.getGamepads?.()[padIndex]?.connected);
$("mPad").addEventListener("click", () => {
  const open = document.body.classList.toggle("padding");
  $("mPad").classList.toggle("on", open);
  if (!open) padMap.cancel();
  if (open && document.body.classList.contains("crediting")) $("mCredits").click(); // (one page in the keys' place at a time)
});
// the credits page of the Tab panel, in the keys' place like the controller's: what vvoid is made with
$("mCredits").addEventListener("click", () => {
  const open = document.body.classList.toggle("crediting");
  $("mCredits").classList.toggle("on", open);
  if (open && document.body.classList.contains("padding")) $("mPad").click();
});
padMap.onSaved = () => showHelp();
window.addEventListener("gamepadconnected", () => {
  if (!started) $("prompt").textContent = "click or press any button to materialize";
});

// Touch: drag to look, hold a second finger to fly forward. A tap (one finger, short, hardly moved) with
// the crosshair on a portal flies you into it, and on anything else is a click (a post in f0ck and the
// like: listened to and flown to); a double tap surges, as Shift does, until the next double tap.
const touches = new Map();
let tapStart = null, lastTap = 0, tapLater = null, touchSurge = false, pressLater = null;
// a flight a tap on a portal began: into that portal, and no further (see fly)
let portalFlight = null; // { at, realm, nearest }
// (vvoid's own flying by itself, stopped at once: not through the plugins, which, inside one of their
// dimensions, take the asking for their tour and left it flying on)
function stopFlying() {
  portalFlight = null;
  autofly = false;
}
// the portal the crosshair is on, if any: in the hub, one round the clock; in a plugin's dimension, its
// way out (a plugin's exit hook: { at, label, hole? }, or several, while you are in its dimension)
// (what each is called, under the crosshair while it is on one: see showPortalName)
const PORTAL_HOLES = { zone: 112, pt: 220 }; // (how wide a ring's dark sphere is, where it is not the usual)
const PORTAL_NAMES = { f0ck: "f0ck", z0r: "z0r", gumo: "gumo", somafm: "somafm", player: "the player", files: "your files", zone: "the zone", chan: "4chan", shorts: "youtube shorts", tiktok: "tiktok", redgifs: "redgifs", marderchen: "marderchen", discord: "discord", watch: "watch together", bhop: "bhop", mania: "mania", pt: "p.t." };
function portalAimedAt() {
  // (each with the size of its dark sphere: the crosshair on that, and nowhere round it; the way back
  // floating beside you, wherever you are)
  // (on foot, as in bhop, not when you have walked or hopped into it: it fills the view then, and the
  // click is the knife's, not a way back; from a step away it is clicked as ever)
  const intoIt = back.afoot && back.position.distanceTo(camera.position) < BACK_HOLE * 6 * back.size;
  const spots = back.ready && !intoIt ? [{ name: "back", label: back.label, at: back.position, hole: BACK_HOLE * back.size }] : [];
  if (world.realm === "void") spots.push(...portalNames().map((name) => ({ name, at: new THREE.Vector3(...hubSlot(name).at), hole: PORTAL_HOLES[name] ?? 104 })));
  else spots.push(...[].concat(hook("exit") ?? []).map((exit) => ({ name: "exit", hole: 104, ...exit })));
  const ahead = camera.getWorldDirection(new THREE.Vector3());
  let best = null, bestOff = 0;
  for (const spot of spots) {
    const to = spot.at.clone().sub(camera.position), distance = to.length();
    if (distance < 1 || distance > camera.far * 0.97) continue; // (as far as anything is seen: p.t.'s door stands far out, see PORTAL_REACH)
    const off = to.normalize().angleTo(ahead) - Math.atan(spot.hole / distance); // (below 0: on its sphere)
    if (off < bestOff) { bestOff = off; best = spot; }
  }
  return best;
}
// a portal, clicked or tapped (one in the hub, or a dimension's way out): turned to, and flown into (and no
// further: see fly); double clicked or double tapped (fast), in as fast as anything flies
function flyIntoPortal(portal, fast = false) {
  if (held()) return;
  if (forming.has(portal.name)) return note(`${PORTAL_NAMES[portal.name] ?? portal.name} · still forming`); // (its plugin not there yet: nothing to fly into)
  if (portal.name === "back" && !back.next) return note(back.toOrigin ? `${COMPANION} · you are at the origin` : `${COMPANION} · nowhere to go back to yet`); // (in the hub, before you have been anywhere: only company)
  // clicked again at once (a double click) on the way into the same one: faster (the same by its name,
  // not to the unit: a way through may sway, as somafm's favourites under their stations do)
  const same = portalFlight && portalFlight.name === portal.name && portalFlight.label === portal.label && portalFlight.at.distanceTo(portal.at) < 400;
  if (same && (fast || performance.now() - portalFlight.since < 450)) {
    portalFlight.fast = true;
    return note(`${portal.name === "exit" ? portal.label : `into ${portal.label ?? PORTAL_NAMES[portal.name] ?? portal.name}`} · faster`);
  }
  if (portal.name === "back") hook("autofly", false); // (on a tour: the tour is over, you are going back)
  const to = portal.at.clone().sub(camera.position), length = to.length() || 1;
  face(Math.atan2(-to.x, -to.z), Math.asin(Math.max(-1, Math.min(1, to.y / length))));
  autofly = true;
  portalFlight = { at: portal.at, realm: world.realm, nearest: length, since: performance.now(), name: portal.name, label: portal.label, fast };
  // a beam to it, as at a post, held while you fly it (Irrlicht, beside you: only a flash, gone at once)
  const flight = portalFlight;
  if (portal.name === "back") lasers.shoot({ from: lasers.muzzle(camera), to: portal.at, fade: 0.3 });
  else lasers.shoot({ from: lasers.muzzle(camera), to: portal.at, hold: () => portalFlight === flight });
  note(`${portal.label ?? `into ${PORTAL_NAMES[portal.name] ?? portal.name}`}${fast ? " · faster" : ""} · ${matchMedia("(pointer: coarse)").matches ? "tap to stop" : "s to stop"}`);
}
// the portal the crosshair is on, named under it (as a post's portals are in f0ck's dimensions)
// The Tab panel inside a dimension: its own window and the general ones (the map's, the keys, graphics,
// the controller), not every other dimension's too; in the hub, where you choose where to go, all of them.
// A plugin's window is known by its id (<name>Panel, or one named here) and the dimension it belongs to.
const PANEL_REALMS = { f0ckPanel: "f0ck", chanPanel: "chan", tiktokPanel: "tiktok", redgifsPanel: "redgifs", shortsPanel: "shorts", z0rPanel: "z0r", somaPanel: "somafm", filesPanel: "files" };
// whose each plugin's window is: one behind a password (see locks.js) shows only inside its own
// dimensions, never in the hub (its settings are had in it, past its password)
const PANEL_PLUGINS = { ...PANEL_REALMS, playerPanel: "player", bhopPanel: "bhop" };
let panelsFor = null;
function showPanelsFor() {
  const realm = world.realm;
  if (realm === panelsFor) return;
  panelsFor = realm;
  for (const [id, plugin] of Object.entries(PANEL_PLUGINS)) {
    const own = PANEL_REALMS[id], away = (own && realm !== "void" && realm !== own) || (locks.has(plugin) && realmOwner[realm] !== plugin);
    document.getElementById(id)?.classList.toggle("elsewhere", away);
  }
}
let portalNameEl = null;
// (portals that are not named under the crosshair: p.t.'s is only a door, and says nothing)
const PORTAL_UNNAMED = new Set(["pt"]);
function showPortalName() {
  const aimed = started && !map.open && !portalFlight ? portalAimedAt() : null;
  const portal = aimed && !PORTAL_UNNAMED.has(aimed.name) ? aimed : null;
  if (!portalNameEl && !portal) return;
  if (!portalNameEl) {
    portalNameEl = Object.assign(document.body.appendChild(document.createElement("div")), { id: "hubPortalName" });
    Object.assign(portalNameEl.style, { position: "fixed", left: "50%", top: "calc(50% + 22px)", transform: "translateX(-50%)", zIndex: 3, pointerEvents: "none", padding: "3px 10px", background: "rgba(2, 3, 14, .62)", color: "#bfe6ff", font: '400 14px "Helvetica Neue", Helvetica, Arial, sans-serif', letterSpacing: ".1em", whiteSpace: "nowrap", transition: "opacity .15s ease", opacity: "0" });
  }
  if (portal) portalNameEl.textContent = `${portal.label ?? PORTAL_NAMES[portal.name] ?? portal.name}${forming.has(portal.name) ? " · forming" : ""}`;
  portalNameEl.style.opacity = portal ? "1" : "0";
}
function tap() {
  // flying by itself (a portal tapped, or autofly): a tap stops it
  if (autofly || portalFlight) {
    stopFlying();
    return note("stopped");
  }
  const portal = portalAimedAt();
  if (portal) return flyIntoPortal(portal);
  hook("mouse", { button: 0, touch: true });
}
// a long press (a finger held still): as a right click is, letting go of what you picked or calling off a
// tour; and any flight by itself stops
function longPress() {
  if (!portalFlight && portalAimedAt()?.name === "back") return turnBack(); // (on Irrlicht: as a right click)
  if (autofly || portalFlight) { stopFlying(); }
  hook("rightClick");
  note("let go");
}
// the fingers on the screen, as the browser has them now (never a count kept along the way: a lift it
// missed, the start screen going from under a finger, left one behind, and two fingers counted as one)
function syncTouches(e) {
  const now = new Set([...e.touches].map((t) => t.identifier));
  for (const id of touches.keys()) if (!now.has(id)) touches.delete(id);
  for (const t of e.touches) if (!touches.has(t.identifier)) touches.set(t.identifier, [t.clientX, t.clientY]);
  touchThrust = e.touches.length > 1 && !map.open ? 1 : 0; // (the panel open: fingers are for it, not for flying)
}
// on the picture itself, every touch is vvoid's own: not a pinch to zoom the page, which a browser (Safari
// above all, which zooms whatever the page asks) starts at a second finger, taking both away from it
const onPicture = (e) => e.target === canvas || e.target === document.body || e.target === document.documentElement || !!e.target.closest?.("#start");
window.addEventListener("touchstart", (e) => {
  if (e.target.closest?.("#start .player")) return; // (a tap on the name field is for typing in it)
  if (onPicture(e) && e.cancelable) e.preventDefault();
  if (!started) { start(); syncTouches(e); return; }
  syncTouches(e);
  const t = e.changedTouches[0];
  tapStart = e.touches.length === 1 ? { id: t.identifier, x: t.clientX, y: t.clientY, at: e.timeStamp } : null;
  clearTimeout(pressLater);
  if (tapStart && !map.open) {
    const held = tapStart;
    pressLater = setTimeout(() => { if (tapStart === held) { tapStart = null; longPress(); } }, 600);
  }
}, { passive: false });
window.addEventListener("touchmove", (e) => {
  if (onPicture(e) && e.cancelable) e.preventDefault();
  const t = e.changedTouches[0], last = touches.get(t.identifier);
  if (last && !map.open) look(t.clientX - last[0], t.clientY - last[1], 0.005 * sensitivity);
  if (tapStart && tapStart.id === t.identifier && Math.hypot(t.clientX - tapStart.x, t.clientY - tapStart.y) > 12) { tapStart = null; clearTimeout(pressLater); } // (moved: a drag, not a tap nor a press)
  for (const c of e.changedTouches) touches.set(c.identifier, [c.clientX, c.clientY]);
}, { passive: false });
for (const type of ["gesturestart", "gesturechange"]) document.addEventListener(type, (e) => e.preventDefault()); // (Safari's own pinch)
const touchEnd = (e) => {
  clearTimeout(pressLater);
  // (a finger lifted is what a browser lets sound begin on: a touch put down is not, and the start
  // screen's touch is taken whole, so no click follows it)
  if (audio.ctx?.state === "suspended") audio.ctx.resume().catch(() => {});
  for (const t of e.changedTouches) {
    const moved = tapStart && tapStart.id === t.identifier ? Math.hypot(t.clientX - tapStart.x, t.clientY - tapStart.y) : Infinity;
    if (e.type === "touchend" && moved < 12 && e.timeStamp - tapStart.at < 300 && !map.open) {
      // a tap: a second one soon after makes it a double tap (and the first is no tap of its own)
      if (e.timeStamp - lastTap < 320) {
        clearTimeout(tapLater);
        lastTap = 0;
        // on a portal: into it, fast (as a double click); anywhere else: surge, on or off
        const portal = portalAimedAt();
        if (portal) flyIntoPortal(portal, true);
        else {
          touchSurge = !touchSurge;
          note(touchSurge ? "surge · double tap again to stop" : "surge off");
        }
      } else {
        lastTap = e.timeStamp;
        tapLater = setTimeout(tap, 320);
      }
    }
    if (tapStart?.id === t.identifier) tapStart = null;
  }
  syncTouches(e);
};
window.addEventListener("touchend", touchEnd);
window.addEventListener("touchcancel", touchEnd);
if (matchMedia("(pointer: coarse)").matches) $("prompt").textContent = "tap to materialize · drag to look · two fingers to fly · tap a portal to fly into it · double tap to surge";

const RISE = 2;        // rising and sinking go this much faster than sideways
const RISE_RAMP = 1.2; // seconds of holding rise or sink to reach the full faster climb (or fall)
let riseHold = 0;
function fly(dt) {
  const axis = (pos, neg) => (keys.has(pos) ? 1 : 0) - (keys.has(neg) ? 1 : 0);
  // aim first, so thrust follows where the camera points this frame
  const ease = lookEase() ? 1 - Math.exp(-lookEase() * dt) : 1;
  viewYaw += (yaw - viewYaw) * ease;
  viewPitch += (pitch - viewPitch) * ease;
  roll += (axis("KeyQ", "KeyE") + pad.roll) * ROLL * dt; // Q rolls left, E right
  viewRoll += (roll - viewRoll) * (1 - Math.exp(-8 * dt));
  if (levelling > 0) {
    levelling -= dt;
    for (const p of plugins) if (p.roll) p.roll *= Math.exp(-8 * dt);
  }
  const [qx, qy, qz] = shaken(dt); // (refused or declined at a locked portal: see locks.refused, locks.declined)
  camera.rotation.set(viewPitch + qx, viewYaw + qy, viewRoll + qz + plugins.reduce((sum, p) => sum + (p.roll ?? 0), 0));
  const seat = hook("seat");
  if (seat) {
    // in a plugin's seat: it holds you, and only the view moves
    autofly = false;
    camera.position.lerp(seat.at, 1 - Math.exp(-4 * dt));
    velocity.multiplyScalar(Math.exp(-6 * dt));
    return;
  }

  // a flight a tap on a portal began ends once through it, or once it is passed and falling behind
  if (portalFlight) {
    const d = camera.position.distanceTo(portalFlight.at);
    portalFlight.nearest = Math.min(portalFlight.nearest, d);
    if (world.realm !== portalFlight.realm || d > portalFlight.nearest + 400) { stopFlying(); }
  }
  thrust.set(axis("KeyD", "KeyA") + pad.x, 0, axis("KeyS", "KeyW") + pad.y - touchThrust - (autofly ? 1 : 0));
  thrust.applyEuler(camera.rotation);
  const lift = Math.max(-1, Math.min(1, axis("Space", "KeyC") - (keys.has("ControlLeft") ? 1 : 0) + pad.rise));
  thrust.y += lift;
  if (thrust.lengthSq() > 1) thrust.normalize();
  const forward = thrust.dot(camera.getWorldDirection(ahead));
  if (forward > 0) thrust.addScaledVector(ahead, forward * (AHEAD - 1));
  // (a portal double clicked: in as fast as anything flies, Shift twice's hyper speed)
  const surge = portalFlight?.fast ? SURGE * HYPER : keys.has("ShiftLeft") || keys.has("ShiftRight") || pad.surge || touchSurge ? SURGE * (hyper ? HYPER : 1) : 1;
  velocity.addScaledVector(thrust, THRUST * surge * dt);
  // up and down faster than sideways (see RISE), and picking up the longer rise or sink is held, by 0.6 more (a tap stays gentle)
  riseHold = lift ? Math.min(riseHold + dt, RISE_RAMP) : 0;
  velocity.y += THRUST * surge * dt * lift * (RISE - 1 + 0.6 * (riseHold / RISE_RAMP));
  for (const p of plugins) if (p.pull) velocity.addScaledVector(p.pull, dt); // whatever a plugin pulls you with (a portal's draw)
  velocity.multiplyScalar(Math.exp(-DRAG * dt));
  // a plugin flying you somewhere: steered there, and turned to it
  // Shift on the way hurries the flight (twice tapped: more)
  const hurry = surge > 1 ? (hyper ? 4 : 2.5) : 1;
  // (not while flying into a portal you clicked: Irrlicht, on a tour, is gone into, not steered away from)
  const steer = portalFlight ? null : hook("steer", camera, dt, hurry);
  back.touring = !!steer; // (a plugin flying you: Irrlicht keeps out of its way, see back.js)
  if (steer) {
    velocity.lerp(steer.velocity, 1 - Math.exp(-3 * (steer.hurry ?? 1) * dt));
    if (steer.look) face(steer.look.yaw, steer.look.pitch);
  }
  camera.position.addScaledVector(velocity, dt * world.slow);
  // things are solid: you bounce off them (twice over, for corners)
  let impact = 0;
  for (let pass = 0; pass < 2; pass++) impact = Math.max(impact, world.collide(camera.position, velocity, BODY), ...plugins.map((p) => p.collide?.(camera.position, velocity, BODY) ?? 0));
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

// The frames' clock (graphics panel). With vsync (the default) they come with the screen's refreshes,
// and a cap takes whole ones: a refresh come too soon is left out (a millisecond's grace, so a 60 on a
// 60 screen is not halved by the timer's jitter), so on a 100 Hz screen a cap of 60 is 50, every second
// refresh, and motion stays even. Without, they are drawn on a clock of their own, at the cap exactly
// or as fast as they can, and the screen shows the newest at each refresh: any rate, though motion is
// less even when it does not divide the screen's.
let freeAt = 0, freeTimer = 0;
// the time between frames aimed at, in milliseconds (none: a 60 screen's, as good as it gets for most)
const frameAim = () => (gfx.fps ? 1000 / gfx.fps : 1000 / 60);
// without vsync: a frame, then the next when its time comes (a cap), or at once (none: a message, which
// is not held back as a nested timer is). Each run of it has its own number, so a change of choice
// never leaves two going; and in a hidden tab it only ticks over.
const freeChannel = new MessageChannel();
let freeRunning = 0;
function freeRun(run) {
  if (run !== freeRunning || gfx.vsync) return;
  const now = performance.now();
  if (document.hidden) { freeTimer = setTimeout(freeRun, 250, run); return; }
  if (gfx.fps) {
    const gap = 1000 / gfx.fps;
    if (now < freeAt - 0.5) { freeTimer = setTimeout(freeRun, freeAt - now, run); return; }
    freeAt = now - freeAt > gap ? now + gap : freeAt + gap; // (kept in step; fallen far behind, it starts afresh)
  }
  frame(now);
  if (gfx.fps) freeTimer = setTimeout(freeRun, Math.max(0, freeAt - performance.now()), run);
  else freeChannel.port1.postMessage(run);
}
freeChannel.port2.onmessage = (e) => freeRun(e.data);
function runFrames() {
  clearTimeout(freeTimer);
  const run = ++freeRunning;
  if (gfx.vsync) {
    renderer.setAnimationLoop((now) => {
      if (gfx.fps && now - last < 1000 / gfx.fps - 1) return; // (this refresh sits out)
      frame(now);
    });
  } else {
    renderer.setAnimationLoop(null);
    freeAt = performance.now();
    freeRun(run);
  }
  showNow();
}

let elapsed = 0, last = performance.now(), coordsTimer = 0, seatedBefore = false;
let watchAsk = 0; // (when next to ask what a tour holds you at: see back.watching)
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  meter.frames++;
  meter.time += dt;
  if (meter.time >= 0.5) { meter.fps = meter.frames / meter.time; meter.frames = 0; meter.time = 0; if (map.open) showNow(); }
  elapsed += dt;
  pollPad(dt);
  if (keys.size || rightHeld) stir(); // (a key held, flying, is not being still)
  $("crosshair").classList.toggle("still", started && performance.now() - stirred > STILL * 1000);
  back.touring = back.afoot = false; // (fly says so again, while a plugin flies you; a plugin moving you on foot, in its update: see back.js)
  back.post = null; // (and a plugin keeping it at a place, in its update too)
  back.terrified = false; // (and a plugin frightening it: see back.js's feel)
  back.pin = null; back.size = 1; // (and a plugin keeping it exactly somewhere, and its size: see back.js)
  if (!started) { idle(elapsed); for (const p of plugins) p.idle?.(dt); } // (what they have in the hub moves behind the start screen too)
  else if (!locks.asking && !hook("busy")) fly(dt); // something of a plugin's is open (a piece, a game): stay where you are
  pushOut(dt); // (turned away from a locked portal: see lockedOut)
  leftLocked();
  const heard = audio.features(dt);
  world.G.uBass.value = heard.bass; world.G.uMid.value = heard.mid; world.G.uHigh.value = heard.high; world.G.uBeat.value = heard.beat;
  world.update(dt, camera);
  meteors.update(dt, camera); // (behind the start screen too)
  lasers.update(dt);
  goo.update(dt, camera);
  if (started) {
    for (const p of plugins) p.update?.(dt, camera);
    back.held = !!portalFlight && portalFlight.at === back.position; // (clicked: it waits to be flown into)
    // (a test: a tour holding you at a post, Irrlicht watches it with you, hearing what you hear: see watch.js)
    if ((watchAsk -= dt) <= 0) {
      watchAsk = 0.3;
      const at = back.touring && velocity.length() < 40 ? hook("notice") : null;
      back.watching = at ? at.picked ?? { id: world.realm, text: "" } : null;
    }
    back.heard = heard;
    if (back.update(dt, camera, started && !hook("hold"))) goBack(); // (held where you are, it keeps away; the Tab panel open, it stays)
    voice.update(dt, velocity.length(), $("entity").classList.contains("show"));
    const seated = !!hook("seat");
    if (seated !== seatedBefore) {
      seatedBefore = seated;
      document.body.classList.toggle("seated", seated);
      showHelp();
    }
    // the entity keeps to the void, and away while a plugin says so
    if (world.realm === "void" && !hook("quiet")) entity.update(dt, camera, velocity.length());
    else audio.entityVoice(0, 0); // and its hum does not follow you out (left humming, it buzzed on in every other dimension)
    entity.meddle(dt); // (its ways with the sound reach everywhere)
  }
  forming.update(dt, camera, started); // (after the plugins: their rings, come, open out where they stand this frame)
  veil = Math.max(0, veil - dt / 1.9);
  fadeEl.style.opacity = Math.max(Math.min(1, veil), back.fade, ...plugins.map((p) => p.fade ?? 0)).toFixed(3); // the dark at any door
  world.sky.render(renderer, camera);
  if (document.visibilityState === "visible") adaptResolution(dt);
  audio.setSpeed(velocity.length());
  // the lens widens a little at speed, and narrows (zooms in) while the right button (or the controller's zoom) is held
  const zooming = padZoom || (rightHeld && performance.now() - rightHeld > ZOOM_AFTER * 1000);
  const fov = baseFov() * (1 + Math.min(velocity.length() / 500, 1) * (18 / OWN_TALL)) * (zooming ? ZOOM : 1); // (from the field of view chosen: see baseFov)
  if (Math.abs(fov - camera.fov) > 0.05) {
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 4);
    camera.updateProjectionMatrix();
  }
  screen.update(dt);
  composer.render(dt);
  if (map.open) map.draw(camera, viewYaw, world.realm);
  showPortalName();
  showPanelsFor();
  // where you are: the sector's grid coordinates, then your offset from its centre in units
  if ((coordsTimer -= dt) <= 0) {
    coordsTimer = 0.15;
    const p = camera.position, cell = (v) => Math.round(v / CELL), off = (v) => Math.round(v - cell(v) * CELL);
    const signed = (n) => (n < 0 ? "−" : "+") + Math.abs(n);
    $("coords").textContent = `${realmNames[world.realm] ? `${realmNames[world.realm]} · ` : ""}sector ${cell(p.x)}, ${cell(p.y)}, ${cell(p.z)} · offset ${signed(off(p.x))} ${signed(off(p.y))} ${signed(off(p.z))}`;
  }
}
runFrames();

// (viewers: the f0ck plugin's viewers, each registering itself as it is made: see back.js)
window.vvoid = {
  world, camera, renderer, entity, back, voice, map, plugins, padMap, CELL, graphics: gfx, viewers: [], meteors, lasers, aim(y, p) { yaw = viewYaw = y; pitch = viewPitch = p; },
  baseFov, // (the camera's own field of view, up and down, before zoom and speed widen or narrow it)
  // Held where you are (see held: a group's member, say), asked by every way into a dimension or a room (its
  // ring, a tag's portal, a search): they neither draw you nor take you, and with say, the reason is said.
  // Never while you are being put somewhere (the group taking you along, the way back, the map).
  held: (say = false) => (moving ? null : say ? held() : hook("hold")),
  // Behind a password (see lockedOut), asked by every way into a dimension with its own name: true when
  // it does not take you yet (the password is asked, and `retry` takes you through once it is given)
  locked: (realm, retry, look) => lockedOut(realm, retry, look), // (look: the gate's { title, color }, if not its own)
  // Still a while (the crosshair gone: see STILL), until the next look round, key or button
  still: () => started && performance.now() - stirred > STILL * 1000,
};

// The plugins behind a password (see locks.js): known before any is installed, so each portal knows at once
const locks = new Locks();
const locksKnown = locks.load();
locks.refused = refused; // (a wrong password: the void answers it)
locks.declined = declined; // (none given, Esc: and that too, quietly)
window.vvoid.locks = locks;

// The plugins (see the top), installed once the game around them is ready: what they are given.
const game = {
  scene, world, audio, map, camera, canvas, velocity, keys, stored, store,
  surging: () => keys.has("ShiftLeft") || keys.has("ShiftRight") || pad.surge, // Shift (or the controller's surge) held
  helpMode: () => helpMode,                 // "keys" or "pad": whichever was used last
  pad: padMap, // the controller's buttons, as mapped (see pad.js): a plugin may add actions of its own
  arrive, face, note, lockPointer, levelOut, showHelp: () => showHelp(),
  goTo,                                     // somewhere at once: { realm, room?, position, yaw, pitch } (see goTo)
  locks,                                    // its password, if it has one: locked(name), ask(name) at its portal (see locks.js)
  lasers, fireLaser,                        // beams (see laser.js): a plugin may shoot, draw another's, or listen
  started: () => started,
  player: () => playerName,                 // the name the traveller gave on the start screen ("" if none)
  aiming,                                  // flying, the pointer held, no map open
  mapOpen: () => map.open,
  closeMap: (lock = true) => { if (map.open) map.toggle(); if (lock) lockPointer(); }, // (lock false: something else takes the screen)
  // how the picture is finished while in a dimension of its own (null: as vvoid's own): tone mapped
  // or not (a page's colours shown as they are), and how much light glows
  finish(look) {
    renderer.toneMapping = look?.toneMapped === false ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    bloom.strength = look?.bloom ?? BLOOM;
  },
  // a dimension of its own: its name, the letter its places are kept under, what it is called, and
  // what stands in each of its sectors
  addRealm(name, letter, title, spec) {
    realmOwner[name] ??= this?.plugin; // (whose: see the plugins' own game, below)
    addRealm(name, `${letter}:`, spec);
    map.addRealm(name, letter, title);
    realmNames[name] = title;
  },
};
// the plugins this vvoid has: first, where their portals stand round the clock (evenly, see hubSlot), then each
const [pluginUrls] = await Promise.all([fetch("/api/plugins").then((r) => (r.ok ? r.json() : [])).catch(() => []), locksKnown]);
setPortals(pluginUrls.map((url) => url.match(/\/plugins\/([^/]+)\//)?.[1]).filter(Boolean));
forming.start(portalNames()); // (each forming in its place until its ring is there: see forming.js)
for (const url of pluginUrls) {
  const name = url.match(/\/plugins\/([^/]+)\//)?.[1];
  try {
    // (each its own game, the same but for knowing whose it is: its dimensions are its, and so is its lock)
    const own = Object.create(game, { plugin: { value: name } });
    plugins.push((await import(url)).default(own) ?? {});
    forming.done(name); // (forming on until its ring is there: see forming.js)
  } catch (err) {
    console.warn(`[vvoid] the plugin ${url} could not be loaded:`, err);
    forming.done(name, false);
  }
}
locks.settle(); // (a session kept over a reload by a plugin that is gone: let go)
panelsFor = null; // (their windows are there now: which are shown where, worked out again)
showHelp();
