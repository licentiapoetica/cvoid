// The way back: a companion, called Irrlicht (a will-o'-the-wisp: a cold flame that keeps by travellers
// in the dark). Once you have gone somewhere (through a portal, into a tag's room, out of
// one, or across the map in one jump), it floats along at your side, off to the left and a little low,
// bobbing as it goes, the way a small machine keeps by someone it looks after. It is not a portal like
// the others: a mouth of dark burnt into the air, its edge burning in a cold blue fire (icefire), giving
// off a thin mist that trails behind it as it moves. Through it, you are back where you were before: the dimension, the room
// in it, and where you were a few seconds before you went (not already in the pull of what took you),
// facing as you faced. Taken, it takes you a step further back the next time, as far as it remembers.
//
// It follows lazily, and waits where it is while you look at it or come near, so it can be flown into
// (or clicked, as the portals round the clock are: see main.js). Flying into it, its mouth opens wide
// round you and the dark gathers, as at any portal. Its name under the crosshair says where it goes.
//
// In its dark, two eyes, glowing as its edge does. They blink, glance about, and show how it is (see
// MOODS): wide and looking all round when it has just come; calm, glancing now and then; looking back
// at you, pleased, when you look at it; happy, two arches, as you fly into it; narrowed and looking
// ahead when you go fast; wide and anxious when you have left it far behind; drowsy, nodding off, when
// you have kept still a long while.
import * as THREE from "three";
import { NOISE_LIB } from "./shaders.js";

export const NAME = "Irrlicht";       // what it is called: said under the crosshair when it is aimed at
export const BACK_HOLE = 26;          // its mouth's dark (the crosshair on this is on it)
const MOUTH = 92;                     // the burning disc drawn round it, edge to edge
const KEEP = 20;                      // how many places back it remembers
const BEFORE = 2.5;                   // seconds before a jump: where you were then
const FAR = 2500;                     // moved this far in one frame: a jump (the map)
const SPOT = new THREE.Vector3(-260, 0, -300); // where it floats, from you: off to the left, at the side of what you see (above where the place's name is written)
const CLEAR_OF = 0.9; // and never long in front of what you look at: within this of straight ahead (cosine, ~25 degrees) it moves aside
const SMOKE = 48, EMBERS = 16; // (a thin smoke: it smoulders, it does not billow)

// the mouth: a disc of dark with a ragged edge that smoulders, embers crawling along it, charred round it
const MOUTH_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const MOUTH_FRAG = /* glsl */ `${NOISE_LIB}
uniform float uTime, uShow, uOpen, uLid, uWide, uSmile; uniform vec2 uLook; varying vec2 vUv;
// one eye, q from its middle: an oval whose lid comes down from the top (lid 0 open, 1 shut), or,
// happy (smile 1), an arch
float eye(vec2 q, float w, float h, float lid, float smile) {
  float body = 1. - smoothstep(.8, 1., length(q / vec2(w, h)));
  body *= 1. - smoothstep(-.012, .012, q.y - (1. - 2. * lid) * h);
  float arc = abs(length(q - vec2(0., -h * .95)) - h * 1.15);
  float arch = (1. - smoothstep(h * .16, h * .3, arc)) * smoothstep(-h * .5, -h * .2, q.y);
  return mix(body, arch, smile);
}
void main(){
  vec2 p = vUv * 2. - 1.;
  float r = length(p), a = atan(p.y, p.x);
  vec2 ring = vec2(cos(a), sin(a));
  float t = uTime;
  // where the edge has burnt to: ragged, eating slowly round
  float edge = .5 + .1 * fbm(vec3(ring * 1.6, t * .18)) + .04 * snoise(vec3(ring * 5., t * .7));
  float inside = 1. - smoothstep(edge - .03, edge + .01, r);
  // the burning rim: thin, hottest at the edge itself, flickering in patches
  float flick = .55 + .45 * snoise(vec3(ring * 3.2, t * 1.9));
  float rim = exp(-abs(r - edge) * 38.) * flick;
  float glow = (step(edge, r) * exp(-(r - edge) * 9.) * .35 + (1. - step(edge, r)) * exp(-(edge - r) * 16.) * .18) * (.6 + .4 * flick); // (out round it; only a little way in)
  vec3 hot = mix(vec3(.04, .22, .85), vec3(.62, .92, 1.), clamp(rim * 1.4, 0., 1.)); // icefire: deep blue, white-cyan where hottest
  // inside: not empty: a slow dark blue turning deep in it
  float swirl = fbm(vec3(p * 2.2 + vec2(sin(t * .2), cos(t * .17)), t * .25 + r * 2.));
  vec3 deep = vec3(.002, .004, .012) + vec3(.01, .035, .1) * smoothstep(.1, .8, swirl) * (1. - r / max(edge, .01));
  // charred round the outside: a faint soot ring, so it reads against bright skies too
  float soot = smoothstep(edge + .3, edge, r) * (1. - inside) * .55;
  vec3 c = deep * inside + hot * (rim + glow) * .62; // (kept under the glow's threshold mostly: an ember, not a flare)
  // its eyes, in the dark, looking where it looks; a hotter middle to each, flickering with its edge
  vec2 e = p - vec2(0., .04) - uLook;
  float w = .052 * uWide, h = .07 * uWide;
  float eyes = eye(e - vec2(-.15, 0.), w, h, uLid, uSmile) + eye(e - vec2(.15, 0.), w, h, uLid, uSmile);
  float core = exp(-dot(e - vec2(-.15, .01), e - vec2(-.15, .01)) * 900.) + exp(-dot(e - vec2(.15, .01), e - vec2(.15, .01)) * 900.);
  c += eyes * inside * mix(vec3(.32, .72, 1.), vec3(.86, .97, 1.), clamp(core, 0., 1.)) * (.78 + .1 * flick);
  float alpha = max(inside, max(soot, clamp(rim + glow, 0., 1.)));
  gl_FragColor = vec4(c * uShow, alpha * uShow);
}`;

// the smoke: soft round puffs, each its own size and darkness, lit warm from below while young
const SMOKE_VERT = /* glsl */ `attribute float aSize; attribute float aLife; attribute float aSeed; varying float vLife; varying float vSeed;
uniform float uScale;
void main(){ vLife = aLife; vSeed = aSeed; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`;
const SMOKE_FRAG = /* glsl */ `${NOISE_LIB}
uniform float uTime, uShow; varying float vLife; varying float vSeed;
void main(){
  if (vLife <= 0.) discard;
  vec2 q = gl_PointCoord * 2. - 1.;
  float wisp = .7 + .3 * snoise(vec3(q * 1.8 + vSeed * 7., uTime * .3 + vSeed));
  float a = smoothstep(1., .2, length(q)) * wisp;
  float age = 1. - vLife;
  vec3 c = mix(vec3(.12, .3, .55), vec3(.085, .1, .13), smoothstep(0., .35, age)); // the cold fire's light on it, then a blue grey mist
  gl_FragColor = vec4(c, a * smoothstep(0., .12, age) * vLife * .16 * uShow);
}`;

const ahead = new THREE.Vector3(), to = new THREE.Vector3(), spot = new THREE.Vector3(), yawOnly = new THREE.Euler(0, 0, 0, "YXZ");
const seg = new THREE.Line3(), near = new THREE.Vector3(), drift = new THREE.Vector3();
const ZERO = new THREE.Vector2(), DOWN = new THREE.Vector2(0, -0.035);
const pullV = new THREE.Vector3(), paceV = new THREE.Vector3(), paceNow = new THREE.Vector3();
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

export class Back {
  // name(realm, room): what a place is called, for the name under the crosshair
  constructor({ scene, world, name }) {
    Object.assign(this, { world, name });
    this.places = [];
    this.recent = []; // where you have been these last seconds: { t, position, yaw, pitch }
    this.time = 0;
    this.here = null;
    this.returning = false;
    this.shown = 0;   // 0 to 1: it comes and goes softly
    this.open = 0;    // 0 to 1: its mouth opening as you fly into it
    this.approach = 0; // how fast you come at it (eased: a frame without moving does not undo it)
    this.fade = 0;    // the dark as you go in (main.js draws it)
    this.home = new THREE.Vector3();     // where it would float (eased towards you)
    this.speed = new THREE.Vector3();    // and how it is going (see place)
    this.yourPace = new THREE.Vector3(); // how you are going, eased
    this.keen = 1.7;
    this.carry = 1;
    this.position = new THREE.Vector3(); // where it is, bobbing (the flight into it follows this: see flyIntoPortal)
    this.lastCam = null;

    const G = world.G;
    this.mouth = new THREE.Mesh(new THREE.PlaneGeometry(MOUTH, MOUTH), new THREE.ShaderMaterial({
      uniforms: {
        uTime: G.uTime, uShow: { value: 0 }, uOpen: { value: 0 },
        uLid: { value: 0.15 }, uWide: { value: 1 }, uSmile: { value: 0 }, uLook: { value: new THREE.Vector2() },
      },
      vertexShader: MOUTH_VERT, fragmentShader: MOUTH_FRAG,
      transparent: true, depthWrite: false,
    }));
    this.mouth.frustumCulled = false;
    this.mouth.visible = false;
    scene.add(this.mouth);

    // smoke and embers live in the world, not on it: it moves on, and what it gave off stays behind
    this.puffs = Array.from({ length: SMOKE }, () => ({ life: 0, span: 1, v: new THREE.Vector3(), grow: 0 }));
    this.puffNext = 0;
    this.puffAt = 0;
    const smoke = new THREE.BufferGeometry();
    smoke.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SMOKE * 3), 3));
    smoke.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(SMOKE), 1));
    smoke.setAttribute("aLife", new THREE.BufferAttribute(new Float32Array(SMOKE), 1));
    smoke.setAttribute("aSeed", new THREE.BufferAttribute(Float32Array.from({ length: SMOKE }, Math.random), 1));
    this.smoke = new THREE.Points(smoke, new THREE.ShaderMaterial({
      uniforms: { uTime: G.uTime, uShow: { value: 0 }, uScale: { value: 1 } }, vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG,
      transparent: true, depthWrite: false,
    }));
    this.smoke.frustumCulled = false;
    this.smoke.visible = false;
    scene.add(this.smoke);

    this.sparks = Array.from({ length: EMBERS }, () => ({ life: 0, v: new THREE.Vector3() }));
    this.sparkAt = 0;
    const embers = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(EMBERS * 3), 3));
    const dot = Object.assign(document.createElement("canvas"), { width: 32, height: 32 }), ctx = dot.getContext("2d"), g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(255,255,255,.5)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    this.embers = new THREE.Points(embers, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(dot), color: new THREE.Color(0.5, 0.85, 1), size: 3.2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.embers.frustumCulled = false;
    this.embers.visible = false;
    scene.add(this.embers);
  }

  // where you are: the dimension, and the room of the viewer that dimension is (see the f0ck plugin)
  where() {
    const realm = this.world.realm, viewer = (window.cvoid?.viewers ?? []).find((v) => v.realm === realm) ?? null, room = viewer?.room ?? null;
    return { key: `${realm}|${room?.key ?? ""}`, realm, viewer, room };
  }

  // the place it goes to, if any
  get next() { return this.places.at(-1) ?? null; }
  get label() { return this.next ? `${NAME} · back to ${this.next.name}` : ""; }
  get ready() { return this.shown > 0.5; }

  // taken: the place it goes to, no longer kept (and the jump there is not itself a place to go back to)
  take() {
    const place = this.places.pop() ?? null;
    if (place) this.returning = true;
    return place;
  }

  // Each frame: a jump noticed, and the companion floated along. True when you have flown into it.
  update(dt, camera, started) {
    this.time += dt;
    const here = this.where(), last = this.recent.at(-1);
    const jumped = this.here && (here.key !== this.here.key || (last && last.position.distanceTo(camera.position) > FAR));
    if (jumped) {
      if (this.returning) this.returning = false;
      else if (started && last) {
        // where you were BEFORE seconds ago (or as long ago as is known)
        const then = this.recent.findLast((r) => r.t <= this.time - BEFORE) ?? this.recent[0];
        this.places.push({ realm: this.here.realm, viewer: this.here.viewer, room: this.here.room, name: this.name(this.here.realm, this.here.room), position: then.position, yaw: then.yaw, pitch: then.pitch });
        if (this.places.length > KEEP) this.places.shift();
        this.place(camera, true);
        this.clearSmoke();
        if (this.mood) this.mood.born = this.time; // (wide eyed again: somewhere new)
      }
      this.recent = [];
      this.lastCam = null;
    }
    this.here = here;
    if (!this.recent.length || this.time - this.recent.at(-1).t > 0.2) {
      this.recent.push({ t: this.time, position: camera.position.clone(), yaw: camera.rotation.y, pitch: camera.rotation.x });
      if (this.recent.length > 40) this.recent.shift();
    }

    const want = started && this.places.length ? 1 : 0;
    this.shown += (want - this.shown) * Math.min(1, dt * 2.5);
    const visible = this.shown > 0.01;
    this.mouth.visible = this.smoke.visible = this.embers.visible = visible;
    let through = false;
    if (visible) {
      // It floats towards its place at your side, unhurried. Never long in front of what you look at:
      // before it a moment (left behind as you turned, or drifted there) and not aimed at, it moves aside,
      // quickly. The crosshair put on it (in that moment, turning to it), clicked, or come near: it waits.
      to.copy(this.position).sub(camera.position);
      const distance = to.length() || 1;
      const facing = camera.getWorldDirection(ahead).dot(to.divideScalar(distance));
      const onIt = facing > Math.cos(Math.atan((BACK_HOLE * 1.3) / distance));
      this.dwell = onIt ? (this.dwell ?? 0) + dt : 0;
      const headingAt = THREE.MathUtils.smoothstep(facing, 0.94, 0.985); // (going its way, not just on past it)
      // regarded (aimed at, near the crosshair, or turned to), it goes on waiting a moment after, so its own
      // drifting off the crosshair does not send it off as if it were in the way
      const nearCrosshair = facing > Math.cos(Math.atan((BACK_HOLE * 3) / distance));
      // (on its way aside, its own passing under the crosshair is not your aiming at it)
      const aside = (this.before ?? 0) > 0.6;
      this.regard = (onIt && !aside) || (nearCrosshair && this.regard > 0) ? 1.5 : Math.max(0, (this.regard ?? 0) - dt); // (near the crosshair keeps a regard, never begins one)
      const waits = this.held || this.regard > 0 || distance < 160 || (this.approach > 40 && headingAt > 0.5);
      this.before = facing > CLEAR_OF && !waits ? (this.before ?? 0) + dt : 0; // (how long it has been before you, not aimed at)
      const inTheWay = this.before > 0.6;
      // going aside: to whichever side of what you see it is on already (never across the middle), and
      // keeping to that side after
      if (inTheWay && !aside) this.side = spot.copy(this.position).project(camera).x >= 0 ? 1 : -1;
      // how keenly it goes to its place (eased from one way of going to another, never switched at once),
      // and how much it keeps your pace (none while it waits: it stays where it is, to be flown into)
      const keen = waits ? 0 : distance > 3000 ? 4 : inTheWay ? 3.2 : 1.7 * THREE.MathUtils.smoothstep(distance, 160, 420);
      this.keen += (keen - this.keen) * Math.min(1, dt * 2.5);
      this.carry += ((waits ? 0 : 1) - this.carry) * Math.min(1, dt * 2.5);
      // (a step too long for one frame is being put somewhere, not speed: it is not taken on)
      if (this.lastCam && dt > 0 && this.lastCam.distanceTo(camera.position) < 300) this.yourPace.lerp(paceNow.copy(camera.position).sub(this.lastCam).divideScalar(dt), Math.min(1, dt * 6));
      this.place(camera, false, dt);
      const follow = this.carry;
      // bobbing as it hovers, a slow small circling with it
      // (less while it waits for you: it is easier to fly into)
      this.position.copy(this.home).add(drift.set(Math.sin(this.time * 0.7) * 9, Math.sin(this.time * 1.3) * 11, Math.cos(this.time * 0.9) * 7).multiplyScalar(0.3 + 0.7 * follow));

      // coming at it: its mouth opens round you and the dark gathers, smoothly, before you are in
      const towards = this.lastCam && dt > 0 ? ahead.copy(camera.position).sub(this.lastCam).dot(to) / dt : 0; // (to: the way to it, from you)
      this.approach += (towards - this.approach) * Math.min(1, dt * 4);
      const closing = THREE.MathUtils.smoothstep(this.approach, 10, 80) * headingAt;
      const nearness = 1 - THREE.MathUtils.smoothstep(distance, BACK_HOLE * 1.2, BACK_HOLE * 9);
      this.open += (closing * nearness - this.open) * Math.min(1, dt * 5);
      this.fade = closing * (1 - THREE.MathUtils.smoothstep(distance, BACK_HOLE * 0.9, BACK_HOLE * 5));
      this.feel(dt, camera, { distance, onIt, closing });
      this.mouth.position.copy(this.position);
      this.mouth.quaternion.copy(camera.quaternion); // (it always faces you)
      this.mouth.scale.setScalar((0.25 + 0.75 * this.shown) * (1 + 2.2 * this.open));
      this.mouth.material.uniforms.uShow.value = this.shown;
      this.mouth.material.uniforms.uOpen.value = this.open;

      // through: its mouth reached (the whole way since the last frame, so no flight is too fast for it)
      if (this.shown > 0.9 && this.lastCam) {
        seg.set(this.lastCam, camera.position);
        through = seg.closestPointToPoint(this.position, true, near).distanceTo(this.position) < BACK_HOLE * 0.8 * (1 + 1.2 * this.open);
      }
    } else {
      this.open = this.fade = this.approach = 0;
    }
    this.burn(dt, camera, visible);
    this.lastCam = (this.lastCam ?? new THREE.Vector3()).copy(camera.position);
    return through;
  }

  // How it is, and so its eyes: wide or narrowed, lids, a smile, where it looks, and its blinking
  feel(dt, camera, { distance, onIt, closing }) {
    const u = this.mouth.material.uniforms, m = (this.mood ??= { lid: 0.15, wide: 1, smile: 0, look: new THREE.Vector2(), glance: new THREE.Vector2(), glanceIn: 0, blinkIn: 3, blink: 0, still: 0, speed: 0, born: this.time });
    m.speed += ((this.lastCam && dt > 0 ? this.lastCam.distanceTo(camera.position) / dt : 0) - m.speed) * Math.min(1, dt * 3);
    m.still = m.speed < 8 ? m.still + dt : 0;
    // where it would look: about it (its glances), at you (the middle of its face), or the way you go
    if ((m.glanceIn -= dt) <= 0) {
      m.glanceIn = THREE.MathUtils.randFloat(1.2, 3.6);
      m.glance.set(THREE.MathUtils.randFloat(-0.055, 0.055), THREE.MathUtils.randFloat(-0.03, 0.04));
    }
    const ahead2 = spot.copy(this.position).project(camera); // (where it is on the screen: the way to the middle is the way you go)
    const towardYou = new THREE.Vector2(-ahead2.x, -ahead2.y).normalize().multiplyScalar(0.05);
    let lid = 0.18, wide = 1, smile = 0, look = m.glance, mood = "calm";
    if (closing > 0.4 || this.open > 0.3) { mood = "happy"; lid = 0; wide = 1.1; smile = 1; look = ZERO; }
    else if (this.time - m.born < 2.2) { mood = "new"; lid = 0; wide = 1.3; if (m.glanceIn > 0.6) m.glanceIn = 0.6; }
    else if (onIt) { mood = "seen"; lid = 0.04; wide = 1.15; smile = 0.3; look = ZERO; }
    else if (distance > 900) { mood = "behind"; lid = 0; wide = 1.28; look = towardYou; }
    else if (m.speed > 700) { mood = "fast"; lid = 0.46; look = towardYou; }
    else if (m.still > 20) { mood = "drowsy"; lid = 0.66 + 0.22 * Math.max(0, Math.sin(this.time * 0.6)); look = DOWN; }
    this.moodName = mood;
    const ease = Math.min(1, dt * 5);
    m.lid += (lid - m.lid) * ease;
    m.wide += (wide - m.wide) * ease;
    m.smile += (smile - m.smile) * Math.min(1, dt * 7);
    m.look.lerp(look, Math.min(1, dt * (mood === "new" ? 10 : 6)));
    // blinking: now and then, sometimes twice; slowly, when drowsy
    if ((m.blinkIn -= dt) <= 0) {
      m.blink = mood === "drowsy" ? 0.5 : 0.15;
      m.blinkFor = m.blink;
      m.blinkIn = mood === "drowsy" ? THREE.MathUtils.randFloat(1.5, 3) : Math.random() < 0.2 ? 0.3 : THREE.MathUtils.randFloat(2.4, 6);
    }
    let shut = 0;
    if (m.blink > 0) {
      m.blink -= dt;
      shut = Math.sin((1 - Math.max(0, m.blink) / m.blinkFor) * Math.PI);
    }
    u.uLid.value = Math.max(m.lid, shut * (1 - m.smile));
    u.uWide.value = m.wide;
    u.uSmile.value = m.smile;
    u.uLook.value.copy(m.look);
  }

  // its smoke and embers: given off at its edge, rising and spreading, left behind as it moves
  burn(dt, camera, giving) {
    const puffs = this.smoke.geometry.attributes, mouth = (MOUTH * 0.25) * this.mouth.scale.x;
    this.puffAt -= dt;
    while (giving && this.puffAt <= 0) {
      this.puffAt += 1 / 13;
      const puff = this.puffs[this.puffNext], i = this.puffNext;
      this.puffNext = (this.puffNext + 1) % SMOKE;
      const a = Math.random() * Math.PI * 2;
      // from its edge, as seen from you (round it on the screen), a little towards you
      spot.set(Math.cos(a) * mouth, Math.sin(a) * mouth, 4).applyQuaternion(camera.quaternion).add(this.position);
      puffs.position.setXYZ(i, spot.x, spot.y, spot.z);
      puff.v.set(rand(-6, 6), rand(14, 30), rand(-6, 6)).add(spot.sub(this.position).multiplyScalar(0.25));
      puff.span = rand(1.6, 2.6);
      puff.life = 1;
      puff.grow = rand(22, 36);
      puffs.aSize.setX(i, rand(30, 42)); // (larger than the gaps between them: a haze, not dots)
    }
    for (let i = 0; i < SMOKE; i++) {
      const puff = this.puffs[i];
      if (puff.life <= 0) { puffs.aLife.setX(i, 0); continue; }
      puff.life -= dt / puff.span;
      puff.v.multiplyScalar(Math.exp(-0.5 * dt));
      puffs.position.setXYZ(i, puffs.position.getX(i) + puff.v.x * dt, puffs.position.getY(i) + puff.v.y * dt, puffs.position.getZ(i) + puff.v.z * dt);
      puffs.aSize.setX(i, puffs.aSize.getX(i) + puff.grow * dt);
      puffs.aLife.setX(i, Math.max(0, puff.life));
    }
    puffs.position.needsUpdate = puffs.aSize.needsUpdate = puffs.aLife.needsUpdate = true;
    this.smoke.material.uniforms.uShow.value = this.shown;
    this.smoke.material.uniforms.uScale.value = (this.world.renderer?.domElement.height ?? window.innerHeight) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));

    // embers: now and then one breaks off the edge and drifts up, dimming
    const sparks = this.embers.geometry.attributes.position;
    this.sparkAt -= dt;
    if (giving && this.sparkAt <= 0) {
      this.sparkAt = rand(0.08, 0.3);
      const i = this.sparks.findIndex((s) => s.life <= 0);
      if (i >= 0) {
        const a = Math.random() * Math.PI * 2;
        spot.set(Math.cos(a) * mouth, Math.sin(a) * mouth, 2).applyQuaternion(camera.quaternion).add(this.position);
        sparks.setXYZ(i, spot.x, spot.y, spot.z);
        this.sparks[i].v.set(rand(-10, 10), rand(20, 50), rand(-10, 10));
        this.sparks[i].life = 1;
      }
    }
    for (let i = 0; i < EMBERS; i++) {
      const s = this.sparks[i];
      if (s.life <= 0) { sparks.setXYZ(i, 0, -1e7, 0); continue; }
      s.life -= dt / 1.4;
      sparks.setXYZ(i, sparks.getX(i) + s.v.x * dt + Math.sin(this.time * 6 + i) * 4 * dt, sparks.getY(i) + s.v.y * dt, sparks.getZ(i) + s.v.z * dt);
    }
    sparks.needsUpdate = true;
    this.embers.material.opacity = this.shown * (0.7 + 0.3 * Math.sin(this.time * 9));
  }

  clearSmoke() {
    for (const puff of this.puffs) puff.life = 0;
    for (const s of this.sparks) s.life = 0;
  }

  // its place beside you (turned as you are, but not tipped as you look up or down), at once or easing
  // It moves as a thing with weight does: drawn towards its place by a spring (keen: how strongly), its
  // own speed easing towards yours (carry: how much), so it gathers speed and glides to a stop, and
  // keeps by you at any pace without falling behind.
  place(camera, now, dt = 0) {
    yawOnly.set(0, camera.rotation.y, 0);
    spot.copy(SPOT).setX(Math.abs(SPOT.x) * (this.side ?? -1)).applyEuler(yawOnly).add(camera.position);
    if (now) {
      this.home.copy(spot);
      this.speed.set(0, 0, 0);
      this.yourPace.set(0, 0, 0);
      return;
    }
    const k = this.keen, damp = Math.max(2 * k, 2.2);
    const pull = pullV.copy(spot).sub(this.home).multiplyScalar(k * k).add(paceV.copy(this.yourPace).multiplyScalar(this.carry).sub(this.speed).multiplyScalar(damp));
    this.speed.addScaledVector(pull, dt);
    this.home.addScaledVector(this.speed, dt);
  }
}
