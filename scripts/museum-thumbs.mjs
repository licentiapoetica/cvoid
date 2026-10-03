// Takes a picture of each of marderchen's Flash pieces running in Ruffle, for the museum walls,
// and notes which ones Ruffle can actually play. Needs the game server running and a Chromium.
//   npm start            (in another terminal)
//   npm run museum:thumbs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MUSEUM = path.join(root, ".cache", "marderchen-museum");
const BASE = process.env.CVOID_URL ?? "http://127.0.0.1:5173";
const CHROME = process.env.CHROME ?? "/usr/bin/chromium";

const manifest = JSON.parse(await fs.readFile(path.join(MUSEUM, "manifest.json"), "utf8"));
const todo = manifest.filter((item) => item.kind === "flash" && (process.argv.includes("--all") || item.runs === undefined));
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new",
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--mute-audio", "--autoplay-policy=no-user-gesture-required"],
});

async function shoot(item) {
  const page = await browser.newPage();
  await page.setViewport({ width: 512, height: 384 });
  let panic = null;
  page.on("console", (m) => { if (/panic|RuffleError|Error loading|unreachable/i.test(m.text())) panic ??= m.text().slice(0, 160); });
  try {
    await page.goto(`${BASE}/museum-player.html`, { waitUntil: "load" });
    const meta = await page.evaluate((src) => new Promise((resolve) => {
      const player = window.RufflePlayer.newest().createPlayer();
      player.style.cssText = "width:512px;height:384px;display:block";
      document.body.appendChild(player);
      player.addEventListener("loadedmetadata", () => resolve({ ...player.metadata }));
      setTimeout(() => resolve(null), 15000);
      player.load({ url: `/museum/src/${src}`, autoplay: "on", unmuteOverlay: "hidden", splashScreen: false, letterbox: "on", backgroundColor: "#000000" }).catch(() => resolve(null));
    }), item.src);
    await new Promise((r) => setTimeout(r, 6000));
    item.runs = !!meta && !panic;
    if (meta) Object.assign(item, { width: meta.width, height: meta.height, as3: meta.isActionScript3 });
    if (item.runs) {
      await page.screenshot({ path: path.join(MUSEUM, "thumbs", `${item.id}.jpg`), type: "jpeg", quality: 72 });
      item.thumb = `thumbs/${item.id}.jpg`;
    }
  } catch (err) {
    item.runs = false;
    panic ??= err.message;
  }
  console.log(`${item.runs ? "ok  " : "FAIL"} ${item.title}${panic ? `  (${panic.split("\n")[0].slice(0, 90)})` : ""}`);
  await page.close().catch(() => {});
}

const queue = [...todo];
await Promise.all(Array.from({ length: 3 }, async () => { while (queue.length) await shoot(queue.shift()); }));
await browser.close();
await fs.writeFile(path.join(MUSEUM, "manifest.json"), JSON.stringify(manifest, null, 1));
const flash = manifest.filter((i) => i.kind === "flash");
console.log(`${flash.filter((i) => i.runs).length} of ${flash.length} Flash pieces run in Ruffle`);
