// Builds marderchen's museum from the archive of his site.
//
//   persona/marderchen/          the mirror of his site (or a crawl in .cache/marderchen-archive/)
//   .cache/marderchen-museum/    what this script makes: thumbnails, web video of his GIFs,
//                                screen-sized copies of his photos, and manifest.json
//
// Neither folder is in git: his art is served from the archive, not copied into the repository.
// Needs ffmpeg. Run: npm run museum   (then: npm run museum:thumbs, for pictures of the Flash pieces)
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVE = [path.join(root, "persona", "marderchen"), path.join(root, ".cache", "marderchen-archive")].find(existsSync) ?? path.join(root, "persona", "marderchen");
const MUSEUM = path.join(root, ".cache", "marderchen-museum");

// Not art, and possibly private: left out of the museum (they stay in the archive).
const SKIP = /^Hilfeplan/i;
// He put "epilepsy" in the names himself; these get a warning before they play.
const FLASHING = /epilep|betternot|strobo|flash(ing)?_|colorepilepsy|psy|fusing|trip/i;

async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else out.push(full);
  }
  return out;
}

const ffmpeg = (...args) => run("ffmpeg", ["-v", "error", "-y", ...args], { maxBuffer: 1 << 26 });
const exists = (file) => fs.access(file).then(() => true, () => false);
const even = "trunc(iw/2)*2:trunc(ih/2)*2";

const files = (await walk(ARCHIVE)).sort((a, b) => a.localeCompare(b));
if (!files.length) {
  console.error(`No archive at ${ARCHIVE}. Mirror the site first (see README).`);
  process.exit(1);
}
for (const dir of ["thumbs", "video", "view"]) await fs.mkdir(path.join(MUSEUM, dir), { recursive: true });

// what an earlier run of museum-thumbs.mjs found out about each Flash piece is kept
const known = new Map(await fs.readFile(path.join(MUSEUM, "manifest.json"), "utf8").then((t) => JSON.parse(t).map((i) => [i.src, i]), () => []));

// stage size from the SWF header: a bit-packed rectangle in twips after the 8-byte signature
async function stageSize(file) {
  const handle = await fs.open(file);
  try {
    const head = Buffer.alloc(4096);
    await handle.read(head, 0, 4096, 0);
    const sig = head.toString("latin1", 0, 3);
    let body = head.subarray(8);
    if (sig === "CWS") body = zlib.inflateSync(body, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
    else if (sig !== "FWS") return {};
    const bits = body[0] >> 3, read = (i) => {
      let v = 0;
      for (let b = 0; b < bits; b++) { const at = 5 + i * bits + b; v = (v << 1) | ((body[at >> 3] >> (7 - (at & 7))) & 1); }
      return v;
    };
    const width = Math.round((read(1) - read(0)) / 20), height = Math.round((read(3) - read(2)) / 20);
    return width > 0 && height > 0 ? { width, height } : {};
  } catch {
    return {};
  } finally {
    await handle.close();
  }
}

const items = [];
let n = 0;
for (const file of files) {
  const ext = path.extname(file).toLowerCase(), name = path.basename(file), rel = path.relative(ARCHIVE, file);
  const kind = ext === ".gif" ? "gif" : ext === ".jpg" || ext === ".jpeg" ? "photo" : ext === ".swf" ? "flash" : null;
  if (!kind || SKIP.test(name) || /backblue|fade\.gif/.test(name)) continue;
  const id = `${kind}-${String(++n).padStart(3, "0")}`;
  const item = { id, kind, title: path.basename(name, path.extname(name)), src: rel.split(path.sep).map(encodeURIComponent).join("/"), warn: FLASHING.test(name) };
  const thumb = path.join(MUSEUM, "thumbs", `${id}.jpg`);
  try {
    if (kind === "gif") {
      const video = path.join(MUSEUM, "video", `${id}.webm`);
      if (!await exists(thumb)) await ffmpeg("-i", file, "-frames:v", "1", "-vf", "scale=256:256:force_original_aspect_ratio=decrease:flags=neighbor", thumb);
      if (!await exists(video)) await ffmpeg("-i", file, "-an", "-c:v", "libvpx-vp9", "-crf", "38", "-b:v", "0", "-pix_fmt", "yuv420p",
        "-vf", `scale='min(360,iw)':-2:flags=neighbor,scale=${even}`, "-t", "20", video);
      item.video = `video/${id}.webm`;
    } else if (kind === "photo") {
      const view = path.join(MUSEUM, "view", `${id}.jpg`);
      if (!await exists(thumb)) await ffmpeg("-i", file, "-vf", "scale=256:256:force_original_aspect_ratio=decrease", thumb);
      if (!await exists(view)) await ffmpeg("-i", file, "-vf", "scale=1920:1920:force_original_aspect_ratio=decrease", "-q:v", "4", view);
      item.view = `view/${id}.jpg`;
    }
    if (kind === "flash") {
      const before = known.get(item.src);
      Object.assign(item, await stageSize(file));
      if (before?.runs !== undefined) item.runs = before.runs;
      else if (await exists(thumb)) item.runs = true; // it was photographed running
    }
    if (await exists(thumb)) item.thumb = `thumbs/${id}.jpg`; // Flash thumbnails come from museum-thumbs.mjs
    items.push(item);
  } catch (err) {
    console.warn(`\nskipped ${name}: ${String(err.message).split("\n")[0]}`);
  }
}
await fs.writeFile(path.join(MUSEUM, "manifest.json"), JSON.stringify(items, null, 1));
const count = (kind) => items.filter((i) => i.kind === kind).length;
console.log(`\n${count("gif")} GIFs, ${count("flash")} Flash pieces, ${count("photo")} photos -> ${path.relative(root, MUSEUM)}/manifest.json`);
