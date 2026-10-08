// What the screen shows over the void, shown in the headset instead (a page's words cannot be seen in
// there): the crosshair (a ring before your eyes, where you look), the place's name and its line, a
// word on what happened, the name of what you look at, what the void says, what Irrlicht says, a
// plugin's keys while you sit in it; each read from the page as it is shown there (its words, and how
// far faded in), and written on a pane that hangs a little below where you look, following your head
// gently. The dark at a door, round your head. While you fly fast, the edges of the view darken (the
// comfort setting: less of the motion seen at the sides, where it makes one sick). Your hands, as two
// small lights. And a menu (Y): the origin, the way back, autofly, the sound, how you turn and how
// big you are, the headset taken off.
import * as THREE from "three";
import { SIZES } from "./xr.js";

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const $ = (id) => document.getElementById(id);
const shown = (el) => (el ? Number(getComputedStyle(el).opacity) || 0 : 0);
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

// a canvas on a plane, its size in metres
function pane(w, h, px) {
  const canvas = Object.assign(document.createElement("canvas"), { width: px, height: Math.round((px * h) / w) });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  mesh.renderOrder = 1001;
  mesh.frustumCulled = false;
  return { canvas, g: canvas.getContext("2d"), texture, mesh, said: "" };
}
const line = (g, text, x, y, size, { color = "#e8eeff", alpha = 1, align = "center", weight = 300, max = 0, spacing = 0 } = {}) => {
  if (!text || alpha <= 0.01) return;
  g.globalAlpha = Math.min(1, alpha);
  g.font = `${weight} ${size}px ${FONT}`;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = "middle";
  g.shadowColor = "rgba(0, 0, 0, .9)";
  g.shadowBlur = size * 0.4;
  if ("letterSpacing" in g) g.letterSpacing = `${spacing}px`;
  let s = String(text);
  if (max) while (s.length > 1 && g.measureText(s).width > max) s = `${s.slice(0, -2)}…`;
  g.fillText(s, x, y);
  g.globalAlpha = 1;
  g.shadowBlur = 0;
  if ("letterSpacing" in g) g.letterSpacing = "0px";
};
// words wrapped to lines no wider than so much
function wrap(g, text, size, max) {
  g.font = `300 ${size}px ${FONT}`;
  const out = [];
  let now = "";
  for (const word of String(text).split(/\s+/)) {
    const next = now ? `${now} ${word}` : word;
    if (g.measureText(next).width > max && now) { out.push(now); now = word; } else now = next;
  }
  if (now) out.push(now);
  return out;
}

export class VoidHud {
  // act: what the menu does ({ origin, back, autofly, mute, volume(+1/-1), leave, say }); locks: vvoid's
  constructor({ xr, scene, act, locks }) {
    this.xr = xr;
    this.act = act;
    this.locks = locks;
    // what follows the head exactly (in metres, about it)
    this.head = new THREE.Group();
    this.head.visible = false;
    scene.add(this.head);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.009, 0.0125, 32), new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    ring.position.z = -1.5;
    ring.renderOrder = 1002;
    this.reticle = ring;
    this.head.add(ring);
    // the dark at a door: a sphere round your head, from inside
    this.dark = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false }));
    this.dark.renderOrder = 1003;
    this.head.add(this.dark);
    // the comfort: the edges darkened by how fast you fly
    this.edge = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.ShaderMaterial({
      uniforms: { uOn: { value: 0 } }, transparent: true, depthTest: false, depthWrite: false,
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform float uOn; varying vec2 vUv; void main() { float r = length(vUv - 0.5) * 2.0; gl_FragColor = vec4(0.0, 0.0, 0.0, uOn * smoothstep(0.42 - uOn * 0.12, 0.95, r)); }",
    }));
    this.edge.position.z = -0.5;
    this.edge.renderOrder = 1000;
    this.head.add(this.edge);
    // the words, on a pane a little below where you look (it follows the head gently)
    this.words = pane(1.5, 0.85, 1100);
    this.follow = new THREE.Group();
    this.follow.visible = false;
    this.follow.add(this.words.mesh);
    this.words.mesh.position.set(0, -0.3, -1.6);
    scene.add(this.follow);
    this.followTurn = new THREE.Quaternion();
    // the hands, two small lights
    this.handMarks = ["left", "right"].map((side) => {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.02, 0), new THREE.MeshBasicMaterial({ color: side === "left" ? 0x9fb8ff : 0xffd7a0, transparent: true, opacity: 0.8, toneMapped: false }));
      m.visible = false;
      scene.add(m);
      return m;
    });
    // the menu: where you looked when it opened, held there
    this.menuPane = pane(1.1, 1.0, 900);
    this.menuPane.mesh.visible = false;
    scene.add(this.menuPane.mesh);
    this.menuButtons = [];
    this.menuOver = null;
    this.speed = 0;
    this.lastSaid = 0;
  }
  get menuOpen() { return this.menuPane.mesh.visible; }

  // each frame, once the camera is your head in the void (see VoidXR.place)
  update(dt, camera, { fade = 0, speed = 0, seated = false } = {}) {
    const xr = this.xr, s = xr.scale;
    this.head.visible = this.follow.visible = true;
    this.head.position.copy(camera.position);
    this.head.quaternion.copy(camera.quaternion);
    this.head.scale.setScalar(s);
    // (the words: turned after the head, a little behind it)
    this.followTurn.slerp(camera.quaternion, 1 - Math.exp(-4 * dt));
    this.follow.position.copy(camera.position);
    this.follow.quaternion.copy(this.followTurn);
    this.follow.scale.setScalar(s);
    this.dark.material.opacity = Math.min(1, fade);
    this.reticle.material.opacity = Math.max(0.12, shown($("crosshair")) * (seated ? 0.3 : 1));
    this.reticle.scale.setScalar(shown($("hubPortalName")) > 0.5 ? 1.5 : 1);
    // comfort: dark at the edges, more the faster (in metres a second, as it feels)
    this.speed += (speed / s - this.speed) * (1 - Math.exp(-6 * dt));
    this.edge.material.uniforms.uOn.value = xr.settings.comfort ? THREE.MathUtils.smoothstep(this.speed, 2, 10) * 0.85 : 0;
    // the hands
    ["left", "right"].forEach((side, i) => {
      const h = xr.hands[side], m = this.handMarks[i];
      m.visible = h.grip.ok;
      if (!m.visible) return;
      xr.toVoid(h.grip.position, m.position);
      m.quaternion.copy(xr.body).multiply(h.grip.quaternion);
      m.scale.setScalar(s);
    });
    if ((this.lastSaid -= dt) <= 0) { this.lastSaid = 0.08; this.say(); }
    if (this.menuOpen) this.menu(camera);
  }
  hide() {
    this.head.visible = this.follow.visible = this.menuPane.mesh.visible = false;
    for (const m of this.handMarks) m.visible = false;
  }

  // the page's words as they are now, written on the pane when anything of them changed
  say() {
    const el = (id) => $(id), q = (x) => Math.round(x * 12) / 12;
    const portal = el("hubPortalName"), asking = this.locks.asking;
    const parts = {
      name: el("name")?.textContent, inscription: el("inscription")?.textContent, sector: q(shown(el("sector"))),
      status: el("status")?.textContent, meta: q(shown(el("meta"))), color: el("meta")?.style.color,
      note: el("note")?.textContent, noteOn: q(shown(el("note"))),
      portal: portal?.textContent, portalOn: q(shown(portal)),
      entity: el("entity")?.textContent, entityOn: q(shown(el("entity"))),
      irrlicht: el("irrlicht")?.textContent, irrlichtOn: q(shown(el("irrlicht"))),
      waits: el("waits")?.textContent, help: document.body.classList.contains("seated") ? el("help")?.textContent : "",
      asking: asking ? document.querySelector("#lockGate h2, .lock h2")?.textContent || asking : "",
    };
    const key = JSON.stringify(parts);
    const w = this.words;
    if (key === w.said) return;
    w.said = key;
    const g = w.g, W = w.canvas.width, H = w.canvas.height;
    g.clearRect(0, 0, W, H);
    // under the crosshair (the pane's top is a little below it): what you look at, then a word on what happened
    line(g, parts.portal, W / 2, 34, 34, { alpha: parts.portalOn, color: "#bfe6ff", spacing: 2 });
    line(g, parts.note, W / 2, 84, 30, { alpha: parts.noteOn, spacing: 1 });
    if (parts.asking) {
      line(g, `${parts.asking} asks for its password`, W / 2, 150, 34, { color: "#ffd8a0" });
      line(g, "give it on the screen first (it can be remembered) · a trigger turns away", W / 2, 196, 24, { alpha: 0.75 });
    }
    // what the void says, and what Irrlicht says
    let y = 250;
    for (const [text, on, color] of [[parts.entity, parts.entityOn, "#f2e6ff"], [parts.irrlicht, parts.irrlichtOn, "#cfe9ff"]]) {
      if (!text || on < 0.02) continue;
      for (const l of wrap(g, text, 30, W - 160).slice(0, 3)) { line(g, l, W / 2, y, 30, { alpha: on, color }); y += 40; }
      y += 14;
    }
    // where you are
    line(g, parts.name, W / 2, H - 170, 52, { alpha: parts.sector, weight: 200, spacing: 8, max: W - 60 });
    for (const [i, l] of wrap(g, parts.inscription, 26, W - 140).slice(0, 2).entries()) line(g, l, W / 2, H - 116 + i * 34, 26, { alpha: parts.sector * 0.85 });
    line(g, parts.waits, W / 2, H - 52, 20, { alpha: parts.meta, spacing: 3 });
    line(g, parts.status, W / 2, H - 22, 20, { alpha: parts.meta, color: parts.color || "#cfd8ff", spacing: 1, max: W - 60 });
    if (parts.help) line(g, parts.help, W / 2, H - 22, 18, { alpha: 0.6, max: W - 40 });
    w.texture.needsUpdate = true;
  }

  // ---- the menu ----
  toggleMenu(camera) {
    const m = this.menuPane.mesh;
    if (m.visible) { m.visible = false; return; }
    // (hung where you look, level, before you)
    const s = this.xr.scale;
    _v.set(0, 0, -1).applyQuaternion(camera.quaternion);
    _v.y = 0;
    if (_v.lengthSq() < 1e-6) _v.set(0, 0, -1);
    _v.normalize();
    m.position.copy(camera.position).addScaledVector(_v, 1.3 * s);
    m.position.y -= 0.1 * s;
    m.lookAt(camera.position.x, m.position.y, camera.position.z);
    m.scale.setScalar(s);
    m.visible = true;
    this.menuPane.said = "";
  }
  // where you look on it: the button there; a trigger presses it
  menu(camera) {
    const p = this.menuPane, m = p.mesh;
    const ray = new THREE.Ray(camera.position, _v.set(0, 0, -1).applyQuaternion(camera.quaternion).clone());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1).applyQuaternion(m.quaternion), m.position);
    const hit = ray.intersectPlane(plane, new THREE.Vector3());
    let over = null;
    if (hit) {
      const local = m.worldToLocal(hit.clone());
      const u = local.x / 1.1 + 0.5, v = 0.5 - local.y / 1.0;
      const x = u * p.canvas.width, y = v * p.canvas.height;
      over = this.menuButtons.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) ?? null;
    }
    if ((over?.id ?? null) !== (this.menuOver?.id ?? null)) { this.menuOver = over; p.said = ""; }
    this.drawMenu();
  }
  // a trigger, while the menu is open: the button looked at, or (looking away) the menu shut
  press() {
    const b = this.menuOver;
    if (!b) { this.menuPane.mesh.visible = false; return; }
    b.do();
    this.menuPane.said = "";
  }
  drawMenu() {
    const xr = this.xr, s = xr.settings, a = this.act, p = this.menuPane;
    const items = [
      ["origin", "the origin", () => { a.origin(); this.menuPane.mesh.visible = false; }],
      ["back", "the way back", () => { a.back(); this.menuPane.mesh.visible = false; }],
      ["autofly", "autofly", () => a.autofly()],
      ["mute", a.muted() ? "sound on" : "mute", () => a.mute()],
      ["quieter", "quieter", () => a.volume(-1)],
      ["louder", "louder", () => a.volume(1)],
      ["turn", `turning: ${s.turn === "snap" ? "in steps" : "smoothly"}`, () => { s.turn = s.turn === "snap" ? "smooth" : "snap"; xr.save(); }],
      ["comfort", `comfort: ${s.comfort ? "on" : "off"}`, () => { s.comfort = !s.comfort; xr.save(); }],
      ["size", `you are: ${s.size === "small" ? "small" : s.size === "giant" ? "a giant" : "a person"}`, () => { const order = Object.keys(SIZES); s.size = order[(order.indexOf(s.size) + 1) % order.length]; xr.save(); }],
      ["sharp", `sharpness: ${Math.round(s.sharpness * 100)}% (next time)`, () => { const order = [0.7, 0.85, 1]; s.sharpness = order[(order.indexOf(s.sharpness) + 1) % order.length] ?? 0.85; xr.save(); }],
      ["leave", "take the headset off", () => a.leave()],
      ["close", "go on", () => { this.menuPane.mesh.visible = false; }],
    ];
    const key = JSON.stringify([items.map((i) => i[1]), this.menuOver?.id]);
    if (key === p.said) return;
    p.said = key;
    const g = p.g, W = p.canvas.width, H = p.canvas.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = "rgba(6, 8, 22, 0.86)";
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(160, 180, 240, 0.35)";
    g.lineWidth = 2;
    g.strokeRect(1, 1, W - 2, H - 2);
    line(g, "vvoid", W / 2, 50, 40, { weight: 200, spacing: 14 });
    this.menuButtons = [];
    const cols = 2, bw = (W - 90) / cols, bh = 92;
    items.forEach(([id, label, act], i) => {
      const x = 30 + (i % cols) * (bw + 30), y = 104 + Math.floor(i / cols) * (bh + 12);
      const over = this.menuOver?.id === id;
      g.fillStyle = over ? "rgba(140, 160, 220, 0.34)" : "rgba(140, 160, 220, 0.1)";
      g.fillRect(x, y, bw, bh);
      g.strokeStyle = over ? "rgba(200, 215, 255, 0.9)" : "rgba(140, 160, 220, 0.4)";
      g.strokeRect(x + 1, y + 1, bw - 2, bh - 2);
      line(g, label, x + bw / 2, y + bh / 2, 28, { max: bw - 20 });
      this.menuButtons.push({ id, x, y, w: bw, h: bh, do: act });
    });
    line(g, "look at one, and pull a trigger · y shuts it", W / 2, H - 26, 20, { alpha: 0.6 });
    p.texture.needsUpdate = true;
  }
}
