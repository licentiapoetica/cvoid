// marderchen's museum: his GIF animations, his Flash pieces and the photos of his 0603 clock
// build, hung along a vortex tunnel that starts behind his clock and pulls you gently through.
// Look at a piece and press E: GIFs and photos open full size, Flash pieces play in Ruffle.
//
// The art itself is not in this repository. It is served from a mirror of his site
// (.cache/marderchen-archive) through a manifest built by scripts/museum.mjs.
import * as THREE from "three";
import { CELL } from "./constants.js";

export const MUSEUM_SECTOR = [0, 0, -1];
const RADIUS = 310, PER_RING = 6, RING_GAP = 175, SIZE = 150;
const SECTIONS = { gif: "*.GIF animations", flash: "FLASH  (*.swf)  press E to play", photo: "0603 SMD clock build" };

const forward = new THREE.Vector3(), to = new THREE.Vector3(), colourTmp = new THREE.Vector3(), colour = new THREE.Color();
// Pieces are shown at half brightness: several of his GIFs are pure white or flash, and at full
// strength they bloom and wash the whole tunnel out. Opened with E they are shown as they are.
const DIM = 0.5;

function label(text, colour, width = 900) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  ctx.font = "44px monospace";
  ctx.fillStyle = colour;
  ctx.textAlign = "center";
  ctx.fillText(text, 512, 62, 1000);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, fog: false }));
  sprite.scale.set(width, width * 0.094, 1);
  return sprite;
}

// ---- a DOM element drawn as if it hung on a wall: the 3x3 projective transform that carries the
// element's own rectangle onto four screen points, written out as a CSS matrix3d ----
const adj = (m) => [
  m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4],
  m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5],
  m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3],
];
const mul = (a, b) => Array.from({ length: 9 }, (_, n) => a[3 * Math.floor(n / 3)] * b[n % 3] + a[3 * Math.floor(n / 3) + 1] * b[3 + (n % 3)] + a[3 * Math.floor(n / 3) + 2] * b[6 + (n % 3)]);
function basis(p) { // p: four [x, y] points
  const m = [p[0][0], p[1][0], p[2][0], p[0][1], p[1][1], p[2][1], 1, 1, 1], a = adj(m);
  const v = [0, 1, 2].map((i) => a[3 * i] * p[3][0] + a[3 * i + 1] * p[3][1] + a[3 * i + 2]);
  return mul(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
}
function wallTransform(w, h, corners) {
  const t = mul(basis(corners), adj(basis([[0, 0], [w, 0], [w, h], [0, h]]))).map((n, _, all) => n / all[8]);
  return `matrix3d(${[t[0], t[3], 0, t[6], t[1], t[4], 0, t[7], 0, 0, 1, 0, t[2], t[5], 0, t[8]].join(",")})`;
}

const DWELL = 1.5;                   // seconds of looking straight at a Flash piece before it starts
const CORNERS = [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]]; // top-left, top-right, bottom-right, bottom-left

export class Museum {
  constructor({ group, audio, stageEl, hintEl, wallEl }) {
    Object.assign(this, { group, audio, stageEl, hintEl, wallEl });
    this.ray = new THREE.Raycaster();
    this.gaze = { exhibit: null, time: 0, away: 0 }; // what the middle of the screen is resting on
    this.playing = null;                              // the Flash piece running on its wall
    this.mouth = new THREE.Vector3(0, 0, -950); // where the tunnel opens, just behind the clock
    this.centre = this.mouth;
    this.current = new THREE.Vector3();                      // the pull along the tunnel, added to the traveller's flight
    this.time = 0;
    this.exhibits = [];
    this.focus = null;
    this.open = null;      // the exhibit shown full screen, if any
    this.loading = 0;
    this.scan = 0;
    this.loader = new THREE.TextureLoader();
    this.plane = new THREE.PlaneGeometry(1, 1);
    this.video = Object.assign(document.createElement("video"), { muted: true, loop: true, playsInline: true });
    this.live = null;      // the GIF currently playing on its wall
    this.ready = this.load();
  }

  async load() {
    let items;
    try {
      const res = await fetch("/museum/manifest.json");
      if (!res.ok) throw new Error("no manifest");
      items = await res.json();
    } catch {
      const sign = label("the museum needs his archive: npm run museum", "#ff00ff");
      sign.position.copy(this.mouth);
      this.group.add(sign);
      return;
    }
    // his animations first, then the Flash, then the workbench photos, in the order you fly past them
    const order = ["gif", "flash", "photo"];
    items.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    const frames = new THREE.InstancedMesh(this.plane, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), items.length);
    frames.frustumCulled = false;
    const m = new THREE.Object3D(), colour = new THREE.Color(), axis = new THREE.Vector3();
    let section = null;
    items.forEach((item, i) => {
      // three rows on the left wall, three on the right, each ring a little further in: a slow spiral
      const slot = i % PER_RING, side = slot < 3 ? -1 : 1, lean = ((slot % 3) - 1) * 0.66;
      const z = this.mouth.z - 260 - (i / PER_RING) * RING_GAP;
      const position = new THREE.Vector3(side * RADIUS * Math.cos(lean), RADIUS * Math.sin(lean), z);
      const mesh = new THREE.Mesh(this.plane, new THREE.MeshBasicMaterial({ color: 0x0a0a12, side: THREE.DoubleSide }));
      mesh.position.copy(position);
      mesh.lookAt(axis.set(0, 0, z)); // every piece faces the middle of the tunnel
      mesh.scale.set(SIZE, SIZE * 0.75, 1);
      this.group.add(mesh);
      m.position.copy(position).addScaledVector(to.copy(position).sub(axis).normalize(), 1.5);
      m.quaternion.copy(mesh.quaternion);
      m.scale.set(SIZE + 6, SIZE * 0.75 + 6, 1);
      m.updateMatrix();
      frames.setMatrixAt(i, m.matrix);
      frames.setColorAt(i, colour.setHSL((i / 18) % 1, 1, 0.5).multiplyScalar(0.22)); // dim: 249 lit frames would wash the tunnel out
      this.exhibits.push({ item, mesh, position, frame: i, loaded: false });
      if (item.kind !== section) {
        section = item.kind;
        const sign = label(`[MEOW]  ${SECTIONS[section]}`, "#00ffff", 420);
        sign.position.set(0, 150, z + 120);
        this.group.add(sign);
      }
    });
    this.end = this.mouth.z - 260 - (items.length / PER_RING) * RING_GAP;
    this.frames = frames;
    this.group.add(frames);

    // the vortex: arms of light winding round the tunnel, wide at the mouth so it draws you in
    const arms = 6, step = 34, perArm = Math.ceil((this.mouth.z - this.end + 500) / step);
    this.vortex = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ fog: false }), arms * perArm);
    this.vortex.frustumCulled = false;
    this.vortexZ = new Float32Array(arms * perArm);
    for (let arm = 0; arm < arms; arm++) for (let k = 0; k < perArm; k++) {
      const along = k * step, z = this.mouth.z + 240 - along;
      const radius = 430 + 620 * Math.exp(-along / 300), angle = (arm / arms) * Math.PI * 2 + along * 0.0042;
      m.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, z);
      m.rotation.set(0, 0, angle);
      m.scale.set(7, 22, 7);
      m.updateMatrix();
      this.vortex.setMatrixAt(arm * perArm + k, m.matrix);
      this.vortexZ[arm * perArm + k] = along;
    }
    this.group.add(this.vortex);
    const end = label("[MEOW]  its free use it or parts if you want  =^.^=  CATS are awesome!", "#ff00ff", 560);
    end.position.set(0, 0, this.end - 200);
    this.group.add(end);
  }

  // thumbnails arrive as you come near, a few at a time
  loadNear(camera) {
    for (const exhibit of this.exhibits) {
      if (this.loading >= 6) return;
      if (exhibit.loaded || exhibit.position.distanceToSquared(camera.position) > 1500 * 1500) continue;
      exhibit.loaded = true;
      if (!exhibit.item.thumb) {
        // a Flash piece Ruffle could not photograph: its name stands in for it
        const sign = label(exhibit.item.title, "#ff00ff");
        exhibit.mesh.material.map = sign.material.map;
        exhibit.mesh.material.color.setScalar(DIM);
        exhibit.mesh.scale.set(SIZE, SIZE * 0.094, 1);
        exhibit.mesh.material.needsUpdate = true;
        continue;
      }
      this.loading++;
      this.loader.load(`/museum/${exhibit.item.thumb}`, (texture) => {
        this.loading--;
        texture.colorSpace = THREE.SRGBColorSpace;
        if (exhibit.item.kind === "gif") texture.magFilter = THREE.NearestFilter;
        const aspect = texture.image.width / texture.image.height;
        exhibit.aspect = aspect;
        exhibit.mesh.scale.set(aspect >= 1 ? SIZE : SIZE * aspect, aspect >= 1 ? SIZE / aspect : SIZE, 1);
        exhibit.thumb = texture;
        exhibit.mesh.material.map = texture;
        exhibit.mesh.material.color.setScalar(DIM);
        exhibit.mesh.material.needsUpdate = true;
      }, undefined, () => { this.loading--; });
    }
  }

  // the GIF you are looking at moves; the others wait
  animate(exhibit) {
    if (this.live === exhibit) return;
    if (this.live) {
      this.live.mesh.material.map = this.live.thumb ?? null;
      this.live.mesh.material.needsUpdate = true;
      this.liveTexture?.dispose();
      this.video.pause();
    }
    this.live = exhibit?.item.kind === "gif" && exhibit.item.video && exhibit.thumb ? exhibit : null;
    if (!this.live) return;
    this.video.src = `/museum/${this.live.item.video}`;
    this.video.play().catch(() => {});
    this.liveTexture = new THREE.VideoTexture(this.video);
    this.liveTexture.colorSpace = THREE.SRGBColorSpace;
    this.live.mesh.material.map = this.liveTexture;
    this.live.mesh.material.needsUpdate = true;
  }

  update(dt, camera, inside) {
    this.current.set(0, 0, 0);
    // in the museum means near the tunnel, whatever sector that happens to be
    const at = camera.position;
    inside &&= Math.abs(at.x) < 1100 && Math.abs(at.y) < 1100 && at.z < this.mouth.z + 700 && at.z > (this.end ?? -9000) - 700;
    if (!inside || !this.exhibits.length) {
      this.hintEl.textContent = "";
      this.stopWall();
      return;
    }
    this.watch(dt, camera);
    // the vortex turns and its colours run down the arms; inside it a slow current carries you on,
    // and lets go when you stop to look at something
    this.time += dt;
    this.vortex.rotation.z += dt * 0.16;
    for (let i = 0; i < this.vortexZ.length; i++) {
      this.vortex.setColorAt(i, colour.setHSL((this.vortexZ[i] * 0.0011 - this.time * 0.13) % 1 + 1, 1, 0.5).multiplyScalar(0.55));
    }
    this.vortex.instanceColor.needsUpdate = true;
    const p = camera.position;
    // the current only carries you while you face down the tunnel: turn to a wall and it lets go
    if (Math.hypot(p.x, p.y) < RADIUS && p.z < this.mouth.z + 200 && p.z > this.end && !this.open && camera.getWorldDirection(forward).z < -0.6) this.current.set(0, 0, -70);
    if ((this.scan -= dt) > 0) return;
    this.scan = 0.2;
    this.loadNear(camera);
    camera.getWorldDirection(forward);
    let best = null, bestScore = 0.86; // within about 30 degrees of where you look
    for (const exhibit of this.exhibits) {
      const distance = to.copy(exhibit.position).sub(camera.position).length();
      if (distance > 520) continue;
      const score = to.normalize().dot(forward) - distance / 5000;
      if (score > bestScore) bestScore = score, best = exhibit;
    }
    this.focus = best;
    this.animate(best);
    if (!this.open) {
      const looked = this.gaze.exhibit;
      this.hintEl.textContent = this.playing ? `${this.playing.item.title} · look away to stop · E for full screen`
        : looked ? (looked.item.warn ? `${looked.item.title} · flashing colours · E to play` : `${looked.item.title} · keep looking`)
        : best ? `E · ${best.item.title} · ${best.item.kind}` : "";
    }
  }

  // ---- Flash on the wall ----
  // Look straight at a Flash piece, middle of the screen, for a second and a half and it starts
  // playing where it hangs. Look away and it stops.

  watch(dt, camera) {
    const { gaze } = this;
    let hit = null;
    if (!this.open) {
      this.ray.setFromCamera({ x: 0, y: 0 }, camera);
      this.ray.far = 900;
      const near = this.exhibits.filter((e) => e.item.kind === "flash" && e.position.distanceToSquared(camera.position) < 900 * 900);
      hit = this.ray.intersectObjects(near.map((e) => e.mesh), false)[0]?.object ?? null;
      hit = hit && near.find((e) => e.mesh === hit);
    }
    if (hit === gaze.exhibit) {
      gaze.time += dt;
      gaze.away = 0;
    } else if (gaze.exhibit && !hit && (gaze.away += dt) < 0.35) {
      // a blink of the crosshair off the edge does not count as looking away
    } else {
      gaze.exhibit = hit;
      gaze.time = 0;
      gaze.away = 0;
    }
    const want = gaze.exhibit && gaze.time >= DWELL && !gaze.exhibit.item.warn ? gaze.exhibit : null; // the flashing ones only play when asked (E)
    if (want !== this.playing) {
      this.stopWall();
      if (want) this.startWall(want);
    }
    if (this.playing) this.placeWall(camera);
  }

  async startWall(exhibit) {
    this.playing = exhibit;
    const { item } = exhibit, w = 640, h = Math.round(640 / (item.width && item.height ? item.width / item.height : 4 / 3));
    this.wallSize = [w, h];
    this.wallEl.style.width = `${w}px`;
    this.wallEl.style.height = `${h}px`;
    // the wall shows the piece at its own shape while it plays
    exhibit.mesh.scale.set(SIZE, (SIZE * h) / w, 1);
    this.audio.duck(true);
    try {
      const player = (await this.ruffle()).createPlayer();
      if (this.playing !== exhibit) return;
      player.style.cssText = "width:100%;height:100%;display:block";
      this.wallEl.replaceChildren(player);
      this.wallEl.style.display = "block";
      await player.load({ url: `/museum/src/${item.src}`, autoplay: "on", unmuteOverlay: "hidden", splashScreen: false, letterbox: "off", backgroundColor: "#000000", contextMenu: "off" });
    } catch { this.stopWall(); }
  }

  stopWall() {
    if (!this.playing) return;
    const exhibit = this.playing;
    this.playing = null;
    this.wallEl.querySelector("ruffle-player")?.remove();
    this.wallEl.replaceChildren();
    this.wallEl.style.display = "none";
    if (exhibit.aspect) exhibit.mesh.scale.set(exhibit.aspect >= 1 ? SIZE : SIZE * exhibit.aspect, exhibit.aspect >= 1 ? SIZE / exhibit.aspect : SIZE, 1);
    if (!this.open) this.audio.duck(false);
  }

  // every frame: where the four corners of the piece are on screen, and the player stretched onto them
  placeWall(camera) {
    const { mesh } = this.playing, W = window.innerWidth, H = window.innerHeight, corners = [];
    for (const [x, y] of CORNERS) {
      to.set(x, y, 0).applyMatrix4(mesh.matrixWorld);
      if (forward.copy(to).sub(camera.position).dot(camera.getWorldDirection(colourTmp)) < 1) return this.stopWall(); // a corner is behind you
      to.project(camera);
      corners.push([(to.x * 0.5 + 0.5) * W, (0.5 - to.y * 0.5) * H]);
    }
    this.wallEl.style.transform = wallTransform(this.wallSize[0], this.wallSize[1], corners);
  }

  // ---- full screen ----

  async ruffle() {
    if (!window.RufflePlayer?.newest) {
      window.RufflePlayer = { config: { publicPath: "/vendor/ruffle/", polyfills: false } };
      await new Promise((resolve, reject) => {
        const script = Object.assign(document.createElement("script"), { src: "/vendor/ruffle/ruffle.js", onload: resolve, onerror: reject });
        document.head.appendChild(script);
      });
    }
    return window.RufflePlayer.newest();
  }

  // E: open the piece you are looking at, or close the one that is open
  // whether E has a piece to open: one is being looked at, or one is in view
  canOpen() {
    return !!(this.open || this.gaze.exhibit || this.focus);
  }

  async toggle() {
    if (this.open) return this.pending ? this.confirm() : this.close();
    const exhibit = this.gaze.exhibit ?? this.focus; // what you are looking straight at, else the nearest in view
    this.stopWall();
    if (!exhibit) return;
    const { item } = exhibit, stage = this.stageEl;
    this.open = exhibit;
    this.hintEl.textContent = "";
    document.exitPointerLock?.();
    stage.replaceChildren();
    stage.classList.add("on");
    const caption = Object.assign(document.createElement("div"), { className: "caption", textContent: `${item.title} · by marderchen · E or Esc to go back` });

    if (item.warn && !exhibit.warned) {
      // he named these himself; a visitor should know before it starts
      exhibit.warned = true;
      const warning = Object.assign(document.createElement("div"), { className: "warning" });
      warning.textContent = "flashing colours. marderchen wrote: “its maybe a risk of epileptic shok for others”. press E to play, Esc to leave.";
      stage.append(warning, caption);
      this.pending = true;
      return;
    }
    this.pending = false;
    if (item.kind === "flash") {
      this.audio.duck(true);
      try {
        const player = (await this.ruffle()).createPlayer();
        if (this.open !== exhibit) return;
        const aspect = item.width && item.height ? item.width / item.height : 4 / 3;
        player.style.width = `min(92vw, calc(84vh * ${aspect}))`;
        player.style.height = `min(84vh, calc(92vw / ${aspect}))`;
        stage.append(player, caption);
        await player.load({ url: `/museum/src/${item.src}`, autoplay: "on", unmuteOverlay: "hidden", splashScreen: false, letterbox: "on", backgroundColor: "#000000" });
      } catch {
        stage.append(Object.assign(document.createElement("div"), { className: "warning", textContent: "ruffle could not play this one" }), caption);
      }
    } else {
      const image = Object.assign(document.createElement("img"), { src: item.kind === "photo" ? `/museum/${item.view}` : `/museum/src/${item.src}`, alt: item.title });
      if (item.kind === "gif") image.className = "pixels";
      stage.append(image, caption);
    }
  }

  close() {
    if (!this.open) return;
    const again = this.pending ? this.open : null;
    this.stageEl.querySelector("ruffle-player")?.remove();
    this.stageEl.replaceChildren();
    this.stageEl.classList.remove("on");
    this.audio.duck(false);
    this.open = null;
    this.pending = false;
    return again;
  }

  // E on the warning means go on; Esc means leave
  async confirm() {
    const exhibit = this.close();
    if (exhibit) {
      this.focus = exhibit;
      await this.toggle();
    }
  }
}
