// The map: every sector that has been seen, drawn one horizontal layer at a time.
// Sectors sit on an integer grid (x east, y up, z south); the same coordinates are always the same place.
import { CELL } from "./constants.js";

export class VoidMap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.sectors = new Map();
    // the other dimensions, each mapped separately: the letter their places are kept under, what is
    // known of each place, and what the dimension is called (a plugin may add its own: see addRealm)
    this.realms = new Map();
    this.addRealm("marderchen", "m", "marderchen's dimension");
    this.addRealm("zone", "z", "the zone");
    this.open = false;
    this.layer = 0; // offset from the layer the player is on
    this.mark = null; // the sector where the entity says it is waiting
    // Only where you have actually been is drawn: sectors loaded around you, or dreamt ahead of you,
    // stay off the map until you enter them. Kept across visits ("m:" / "z:" for the other dimensions).
    try { this.visited = new Set(JSON.parse(localStorage.getItem("cvoid.visited")) ?? []); } catch { this.visited = new Set(); }
  }

  visit(key) {
    if (!key || this.visited.has(key)) return;
    this.visited.add(key);
    try { localStorage.setItem("cvoid.visited", JSON.stringify([...this.visited])); } catch { /* private mode: this visit only */ }
  }

  addRealm(name, letter, title) {
    this.realms.set(name, { letter, title, known: new Map() });
  }

  // the explored sectors of a dimension, with what is known of each
  explored(realm) {
    const other = this.realms.get(realm), prefix = other ? `${other.letter}:` : "";
    const known = other?.known ?? this.sectors;
    const out = new Map();
    for (const key of this.visited) {
      if (prefix ? !key.startsWith(prefix) : key[1] === ":") continue;
      const k = key.slice(prefix.length), [x, y, z] = k.split(",").map(Number);
      out.set(k, known.get(k) ?? { x, y, z, name: "", kind: "", glow: "#8fa0d8", unknown: true });
    }
    return out;
  }

  add(key, spec) {
    const realm = key[1] === ":" ? key[0] : "";
    if (realm) key = key.slice(2);
    const [x, y, z] = key.split(",").map(Number);
    const into = [...this.realms.values()].find((r) => r.letter === realm)?.known ?? this.sectors, was = into.get(key);
    into.set(key, { x, y, z, name: spec.name, kind: spec.source === "void" || spec.kind === "none" ? "" : spec.kind, glow: spec.palette.glow, empty: spec.source === "void", label: was?.name === spec.name ? was.label : undefined });
  }

  // a place shown under another name than its own (a plugin's: what happened there), until its own changes
  relabel(realm, key, label) {
    const s = this.realms.get(realm)?.known.get(key);
    if (s) s.label = label;
  }

  // sectors dreamt in earlier sessions live in the server's cache
  async load() {
    try {
      const res = await fetch("/api/sectors");
      if (!res.ok) return;
      for (const s of await res.json()) {
        const key = `${s.x},${s.y},${s.z}`;
        if (!this.sectors.has(key)) this.sectors.set(key, s);
      }
    } catch { /* the map just starts empty */ }
  }

  // Open: the cursor is freed and the view starts on you. Scroll zooms (all the way out, over thousands
  // of sectors), dragging moves the view, a click picks a spot, a double click goes there.
  toggle() {
    this.open = !this.open;
    this.layer = 0;
    this.canvas.classList.toggle("on", this.open);
    document.body.classList.toggle("mapping", this.open);
    this.follow = true;
    this.size = null;
    if (this.open) document.exitPointerLock?.();
    else document.activeElement?.blur?.();
  }

  shift(delta) {
    if (this.open) this.layer += delta;
  }

  resize() {
    const ratio = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = window.innerWidth * ratio;
    this.canvas.height = window.innerHeight * ratio;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  // ---- getting about: picking a spot, going there, spawning there ----

  // what the map is showing, so a click can be read back into the world
  bind({ onGo, onSpawn, spawn }) {
    Object.assign(this, { onGo, onSpawn });
    this.spawn = spawn;
    this.view = { x: 0, z: 0 };
    this.follow = true;
    this.pick = null; // { realm, x, y, z } world position picked
    const $ = (id) => document.getElementById(id);
    this.fields = ["mSX", "mSY", "mSZ", "mOX", "mOY", "mOZ"].map($);
    this.noteEl = $("mNote");
    const canvas = this.canvas;
    let drag = null;
    canvas.addEventListener("wheel", (e) => {
      if (!this.open) return;
      e.preventDefault();
      const before = this.toWorld(e.clientX, e.clientY), factor = Math.exp(-e.deltaY * 0.0015);
      this.size = Math.min(400, Math.max(0.05, this.zoom * factor));
      // zoom about the cursor: the point under it stays under it
      const after = this.toWorld(e.clientX, e.clientY);
      this.view.x += before.x - after.x;
      this.view.z += before.z - after.z;
      this.follow = false;
    }, { passive: false });
    canvas.addEventListener("pointerdown", (e) => {
      if (!this.open) return;
      drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vz: this.view.z, moved: false };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      this.hover = this.open ? { x: e.clientX, y: e.clientY } : null;
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      if (!drag.moved) return;
      this.view.x = drag.vx - dx / this.zoom;
      this.view.z = drag.vz - dy / this.zoom;
      this.follow = false;
    });
    canvas.addEventListener("pointerup", (e) => {
      if (drag && !drag.moved) {
        const at = this.toWorld(e.clientX, e.clientY);
        this.choose(this.realm, at.x * CELL, this.shown * CELL, at.z * CELL);
      }
      drag = null;
    });
    canvas.addEventListener("dblclick", () => this.go());
    $("mGo").addEventListener("click", () => this.go());
    $("mSpawn").addEventListener("click", () => this.setSpawn());
    $("mRandom").addEventListener("click", () => this.random());
    $("mOrigin").addEventListener("click", () => this.origin());
    $("mHere").addEventListener("click", () => { this.follow = true; });
    for (const field of this.fields) {
      field.addEventListener("keydown", (e) => {
        e.stopPropagation(); // typing here is not flying
        if (e.key === "Enter") this.go();
        if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); this.toggle(); }
      });
      field.addEventListener("input", () => this.readFields());
    }
  }

  get zoom() {
    return this.size ?? Math.max(70, Math.min(120, Math.min(window.innerWidth, window.innerHeight) / 7));
  }

  toWorld(cx, cy) {
    return { x: this.view.x + (cx - window.innerWidth / 2) / this.zoom, z: this.view.z + (cy - window.innerHeight / 2) / this.zoom };
  }

  // a position, picked on the map or typed: shown as its sector and the offset from that sector's centre
  choose(realm, x, y, z) {
    this.pick = { realm, x, y, z };
    const sector = [x, y, z].map((v) => Math.round(v / CELL));
    const offset = [x, y, z].map((v, i) => Math.round(v - sector[i] * CELL));
    [...sector, ...offset].forEach((v, i) => { this.fields[i].value = v; });
    this.note(`${realm === "void" ? "" : `${this.realms.get(realm)?.title ?? realm} · `}sector ${sector.join(", ")} · offset ${offset.join(" ")}`);
  }

  readFields() {
    const v = this.fields.map((f) => Number(f.value) || 0);
    const clamp = (o) => Math.max(-CELL / 2, Math.min(CELL / 2, o));
    this.pick = { realm: this.realm, x: Math.round(v[0]) * CELL + clamp(v[3]), y: Math.round(v[1]) * CELL + clamp(v[4]), z: Math.round(v[2]) * CELL + clamp(v[5]) };
  }

  note(text) {
    this.noteEl.textContent = text;
  }

  go() {
    if (!this.pick) return this.note("pick a spot first: click the map, or type a sector and offset");
    const { realm, x, y, z } = this.pick;
    this.onGo(realm, x, y, z);
    this.layer = 0;
    this.follow = true;
  }

  setSpawn() {
    if (!this.pick) return this.note("pick a spot first, then set it as where you start");
    this.spawn = { ...this.pick };
    this.onSpawn(this.spawn);
    this.note("you will start here from now on · origin puts it back");
  }

  // somewhere at random in what the map is showing (zoom out to make it anywhere)
  random() {
    const W = window.innerWidth, H = window.innerHeight, r = Math.random;
    const at = this.toWorld(r() * W, r() * H);
    this.choose(this.realm, at.x * CELL, (this.shown + Math.round((r() - 0.5) * 6)) * CELL + (r() - 0.5) * 2000, at.z * CELL);
    this.go();
  }

  // the hub: always one press away, and where you start again
  origin() {
    this.spawn = null;
    this.onSpawn(null);
    this.choose("void", 0, 100, 600);
    this.go();
    this.note("back at the origin · you start here again");
  }

  draw(camera, yaw, realm = "void") {
    const { ctx } = this, sectors = this.explored(realm), mark = realm === "void" ? this.mark : null;
    const W = window.innerWidth, H = window.innerHeight;
    const size = this.zoom;
    const py = Math.round(camera.position.y / CELL);
    if (this.follow) this.view = { x: camera.position.x / CELL, z: camera.position.z / CELL };
    const px = this.view.x, pz = this.view.z;
    const layer = py + this.layer;
    this.realm = realm;
    this.shown = layer;
    const sx = (x) => W / 2 + (x - px) * size, sz = (z) => H / 2 + (z - pz) * size;
    const font = '"Helvetica Neue", Helvetica, Arial, sans-serif';
    if (size < 30) return this.drawFar(camera, yaw, realm, sectors, layer, py, sx, sz, size, font);

    // which columns have sectors above or below this layer
    const above = new Map(), below = new Map();
    for (const s of sectors.values()) {
      if (s.y === layer) continue;
      const column = s.y > layer ? above : below;
      column.set(`${s.x},${s.z}`, (column.get(`${s.x},${s.z}`) ?? 0) + 1);
    }

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(2, 3, 14, 0.84)";
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = "top";
    const box = size - 8;
    const spanX = Math.ceil(W / size / 2) + 1, spanZ = Math.ceil(H / size / 2) + 1;
    for (let x = Math.round(px) - spanX; x <= Math.round(px) + spanX; x++) {
      for (let z = Math.round(pz) - spanZ; z <= Math.round(pz) + spanZ; z++) {
        const left = sx(x) - box / 2, top = sz(z) - box / 2;
        const s = sectors.get(`${x},${layer},${z}`);
        if (!s) continue; // not been there: nothing to show
        ctx.lineWidth = 1;
        ctx.strokeStyle = s && !s.empty ? s.glow : `rgba(140, 160, 220, ${s ? 0.3 : 0.12})`;
        ctx.setLineDash(s && !s.empty ? [] : [2, 5]);
        ctx.strokeRect(left + 0.5, top + 0.5, box, box);
        ctx.setLineDash([]);
        if (size < 64) {
          if (s && !s.empty) {
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = s.glow;
            ctx.fillRect(left, top, box, box);
            ctx.globalAlpha = 1;
          }
        } else if (s?.empty) {
          // a void that has been crossed: known, and known to be nothing
          ctx.font = `300 10px ${font}`;
          ctx.fillStyle = "rgba(190, 205, 255, 0.3)";
          ctx.fillText("void", left + 6, top + 20);
        } else if (s) {
          ctx.globalAlpha = 0.12;
          ctx.fillStyle = s.glow;
          ctx.fillRect(left, top, box, box);
          ctx.globalAlpha = 1;
          ctx.fillStyle = "#dfe8ff";
          ctx.font = `300 11px ${font}`;
          let line = "", row = 0;
          const name = s.label ?? s.name;
          for (const word of name.split(" ")) {
            if (line && ctx.measureText(`${line} ${word}`).width > box - 12) {
              ctx.fillText(line, left + 6, top + 20 + row++ * 13);
              line = word;
            } else line = line ? `${line} ${word}` : word;
          }
          ctx.fillText(line, left + 6, top + 20 + row * 13);
          ctx.fillStyle = s.glow;
          ctx.font = `300 9px ${font}`;
          ctx.fillText(s.kind, left + 6, top + box - 15, box - 12);
        }
        if (size < 64) continue;
        ctx.font = `300 9px ${font}`;
        ctx.fillStyle = "rgba(190, 205, 255, 0.45)";
        ctx.fillText(`${x}, ${z}`, left + 6, top + 6);
        const up = above.get(`${x},${z}`), down = below.get(`${x},${z}`);
        if (up || down) {
          ctx.textAlign = "right";
          ctx.fillText(`${up ? `▲${up}` : ""}${down ? ` ▼${down}` : ""}`, left + box - 5, top + 6);
          ctx.textAlign = "left";
        }
      }
    }

    if (mark) {
      const [mx, my, mz] = mark;
      if (my === layer) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.arc(sx(mx), sz(mz), box * 0.42, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.font = `300 12px ${font}`;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(`it waits at ${mx}, ${my}, ${mz}${my === layer ? "" : ` · ${Math.abs(my - layer)} layer${Math.abs(my - layer) > 1 ? "s" : ""} ${my > layer ? "up" : "down"}`}`, 24, 62);
    }

    this.drawMarks(camera, yaw, realm, layer, sx, sz);
    this.drawTitle(realm, layer, py, sectors);
  }

  // Far out: too small for a box each. The mapped sectors of this layer are points, and a grid of
  // round numbers keeps you oriented however far out you go.
  drawFar(camera, yaw, realm, sectors, layer, py, sx, sz, size, font) {
    const { ctx } = this, W = window.innerWidth, H = window.innerHeight;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(2, 3, 14, 0.9)";
    ctx.fillRect(0, 0, W, H);
    let step = 1;
    for (let k = 1; step * size < 90; k++) step = [1, 2, 5][k % 3] * 10 ** Math.floor(k / 3); // 2 5 10 20 50 100 ...
    const left = this.toWorld(0, 0), right = this.toWorld(W, H);
    ctx.lineWidth = 1;
    ctx.font = `300 10px ${font}`;
    ctx.fillStyle = "rgba(190, 205, 255, 0.45)";
    for (let x = Math.ceil(left.x / step) * step; x <= right.x; x += step) {
      ctx.strokeStyle = x === 0 ? "rgba(190, 205, 255, 0.35)" : "rgba(140, 160, 220, 0.1)";
      ctx.beginPath();
      ctx.moveTo(sx(x), 0);
      ctx.lineTo(sx(x), H);
      ctx.stroke();
      ctx.fillText(`x ${x}`, sx(x) + 4, 70);
    }
    for (let z = Math.ceil(left.z / step) * step; z <= right.z; z += step) {
      ctx.strokeStyle = z === 0 ? "rgba(190, 205, 255, 0.35)" : "rgba(140, 160, 220, 0.1)";
      ctx.beginPath();
      ctx.moveTo(0, sz(z));
      ctx.lineTo(W, sz(z));
      ctx.stroke();
      ctx.fillText(`z ${z}`, 24, sz(z) + 4);
    }
    const dot = Math.max(1.5, size * 0.8);
    for (const s of sectors.values()) {
      if (s.empty) continue;
      ctx.globalAlpha = s.y === layer ? 1 : 0.18;
      ctx.fillStyle = s.glow;
      ctx.fillRect(sx(s.x) - dot / 2, sz(s.z) - dot / 2, dot, dot);
    }
    ctx.globalAlpha = 1;
    this.drawMarks(camera, yaw, realm, layer, sx, sz);
    this.drawTitle(realm, layer, py, sectors);
  }

  // you, the origin, where you start, and the spot picked
  drawMarks(camera, yaw, realm, layer, sx, sz) {
    const { ctx } = this, font = '"Helvetica Neue", Helvetica, Arial, sans-serif';
    const ring = (x, z, radius, colour, label, dashed = false) => {
      ctx.strokeStyle = colour;
      ctx.fillStyle = colour;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(dashed ? [3, 3] : []);
      ctx.beginPath();
      ctx.arc(sx(x), sz(z), radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `300 11px ${font}`;
      ctx.fillText(label, sx(x) + radius + 5, sz(z) - 6);
    };
    if (realm === "void") ring(0, 0, 9, "#b9d4ff", "origin");
    const spawn = this.spawn;
    if (spawn && spawn.realm === realm) ring(spawn.x / CELL, spawn.z / CELL, 7, "#7dffb0", `you start here${Math.round(spawn.y / CELL) !== layer ? ` · y ${Math.round(spawn.y / CELL)}` : ""}`, true);
    const pick = this.pick;
    if (pick && pick.realm === realm) {
      const x = sx(pick.x / CELL), z = sz(pick.z / CELL);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 12, z); ctx.lineTo(x - 4, z); ctx.moveTo(x + 4, z); ctx.lineTo(x + 12, z);
      ctx.moveTo(x, z - 12); ctx.lineTo(x, z - 4); ctx.moveTo(x, z + 4); ctx.lineTo(x, z + 12);
      ctx.stroke();
    }
    // the player, pointing where they look (yaw 0 faces north, towards -z)
    ctx.save();
    ctx.translate(sx(camera.position.x / CELL), sz(camera.position.z / CELL));
    ctx.rotate(-yaw);
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    if (this.layer === 0) ctx.fill();
    else ctx.stroke();
    ctx.restore();
  }

  drawTitle(realm, layer, py, sectors) {
    const { ctx } = this, font = '"Helvetica Neue", Helvetica, Arial, sans-serif';
    if (this.hover) {
      // where the cursor is, in sectors
      const at = this.toWorld(this.hover.x, this.hover.y);
      ctx.font = `300 11px ${font}`;
      ctx.fillStyle = "rgba(207, 220, 255, 0.8)";
      ctx.fillText(`${Math.round(at.x)}, ${layer}, ${Math.round(at.z)}`, this.hover.x + 14, this.hover.y + 14);
    }
    ctx.font = `300 12px ${font}`;
    ctx.fillStyle = "#cfdcff";
    const where = this.layer === 0 ? "your layer" : `you are on y = ${py}`;
    ctx.fillText(`${this.realms.get(realm)?.title.toUpperCase() ?? "MAP"} · layer y = ${layer} (${where}) · ${sectors.size} sectors explored`, 24, 22);
    ctx.fillStyle = "rgba(207, 220, 255, 0.5)";
    ctx.fillText("x → east · z ↓ south · ▲▼ sectors above / below · page up / down layer · scroll zoom · drag move · click pick · double click go · o origin", 24, 42);
  }
}
