// The map: every sector that has been seen, drawn one horizontal layer at a time.
// Sectors sit on an integer grid (x east, y up, z south); the same coordinates are always the same place.
import { CELL } from "./constants.js";

export class VoidMap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.sectors = new Map();
    this.other = new Map(); // marderchen's dimension, mapped separately
    this.open = false;
    this.layer = 0; // offset from the layer the player is on
    this.mark = null; // the sector where the entity says it is waiting
  }

  add(key, spec) {
    const inside = key.startsWith("m:");
    if (inside) key = key.slice(2);
    const [x, y, z] = key.split(",").map(Number);
    (inside ? this.other : this.sectors).set(key, { x, y, z, name: spec.name, kind: spec.source === "void" ? "" : spec.kind, glow: spec.palette.glow, empty: spec.source === "void" });
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

  toggle() {
    this.open = !this.open;
    this.layer = 0;
    this.canvas.classList.toggle("on", this.open);
    document.body.classList.toggle("mapping", this.open);
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

  draw(camera, yaw, inside = false) {
    const { ctx } = this, sectors = inside ? this.other : this.sectors, mark = inside ? null : this.mark;
    const W = window.innerWidth, H = window.innerHeight;
    const size = Math.max(70, Math.min(120, Math.min(W, H) / 7));
    const px = camera.position.x / CELL, pz = camera.position.z / CELL, py = Math.round(camera.position.y / CELL);
    const layer = py + this.layer;
    const sx = (x) => W / 2 + (x - px) * size, sz = (z) => H / 2 + (z - pz) * size;

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
    const box = size - 8, font = '"Helvetica Neue", Helvetica, Arial, sans-serif';
    const spanX = Math.ceil(W / size / 2) + 1, spanZ = Math.ceil(H / size / 2) + 1;
    for (let x = Math.round(px) - spanX; x <= Math.round(px) + spanX; x++) {
      for (let z = Math.round(pz) - spanZ; z <= Math.round(pz) + spanZ; z++) {
        const left = sx(x) - box / 2, top = sz(z) - box / 2;
        const s = sectors.get(`${x},${layer},${z}`);
        ctx.lineWidth = 1;
        ctx.strokeStyle = s && !s.empty ? s.glow : `rgba(140, 160, 220, ${s ? 0.3 : 0.12})`;
        ctx.setLineDash(s && !s.empty ? [] : [2, 5]);
        ctx.strokeRect(left + 0.5, top + 0.5, box, box);
        ctx.setLineDash([]);
        if (s?.empty) {
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
          for (const word of s.name.split(" ")) {
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

    // the player, pointing where they look (yaw 0 faces north, towards -z)
    ctx.save();
    ctx.translate(W / 2, H / 2);
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

    ctx.font = `300 12px ${font}`;
    ctx.fillStyle = "#cfdcff";
    const where = this.layer === 0 ? "your layer" : `you are on y = ${py}`;
    ctx.fillText(`${inside ? "MARDERCHEN'S DIMENSION" : "MAP"} · layer y = ${layer} (${where}) · ${sectors.size} sectors mapped`, 24, 22);
    ctx.fillStyle = "rgba(207, 220, 255, 0.5)";
    ctx.fillText("x → east · z ↓ south · ▲▼ sectors above / below · page up / page down or bumpers change layer", 24, 42);
  }
}
