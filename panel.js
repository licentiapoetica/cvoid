// vvoid's panel: a small web server of its own, apart from vvoid's (npm run panel; http://127.0.0.1:5174),
// where what vvoid is set by is turned. Its settings and its plugins' (.env, each as its README describes
// it, or the whole file as it is), which plugins are on, the void's look (see public/src/look.js), and vvoid
// itself: started, stopped and restarted from here (it reads its settings once, as it starts), and what it
// writes, read here as it writes it.
// The way in: VVOID_PANEL_KEY (in .env); unset, a new key every time the panel starts, in the link it
// prints. A right key is given a session (in memory: the panel restarting lets every one go), which the
// page sends with every request (never a cookie: vvoid on the same address would be sent it too).
// The panel reads .env itself, and never into its own environment: vvoid, started from here, reads it
// afresh each time. A setting in the environment the panel was started from is over the file's (as with
// npm start), and the settings page says so where it is.
import http from "node:http";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { LOOK, cleanLooks } from "./public/src/look.js";
import { CELL, REACH, UNIT, PORTAL_ORDER, PORTAL_RING } from "./public/src/constants.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.join(here, ".env");
const PUBLIC = path.join(here, "panel");
const PLUGINS = path.join(here, "plugins");
const BACKUPS = path.join(here, ".cache", "panel", "env"); // .env as it was before each change (the last KEEP)
const KEEP = 30;
const hash = (text) => createHash("sha256").update(String(text)).digest();

// ---- .env, line by line, as it is: comments, blanks and order kept ----
// a setting's line: NAME=value, or #NAME=value (commented out: off, its value kept for when it is on again)
const LINE = /^\s*(#\s*)?(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;
// a value as Node reads it (--env-file): in quotes, what is between them; bare, up to a # and trimmed
function unquote(raw) {
  const v = raw.trim(), q = v[0];
  if (q === '"' || q === "'" || q === "`") {
    const end = v.indexOf(q, 1);
    if (end > 0) return q === '"' ? v.slice(1, end).replace(/\\n/g, "\n") : v.slice(1, end);
  }
  return v.replace(/#.*$/, "").trim();
}
// and back: bare where Node would read it so, else in the first quotes it can be put in (null: none)
function quote(value) {
  if (/[\r\n]/.test(value)) return null;
  if (!/#/.test(value) && value === value.trim() && !/^["'`]/.test(value)) return value;
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes("`")) return `\`${value}\``;
  if (!value.includes('"') && !value.includes("\\n")) return `"${value}"`;
  return null;
}
const parse = (text) => text.split(/\r?\n/).map((text) => {
  const m = text.match(LINE);
  return m ? { text, name: m[2], value: unquote(m[3]), off: !!m[1] } : { text };
});
const join = (lines) => lines.map((l) => l.text).join("\n");
// each name as it stands: the last line not commented out (the one Node takes), else the last that is
function settingsOf(lines) {
  const out = new Map();
  for (const l of lines) if (l.name && (l.off ? !out.get(l.name) || out.get(l.name).off : true)) out.set(l.name, l);
  return out;
}
// one change to one name: { name, value, on } (on: its line counts; off: commented out), or { name, remove }
function change(lines, { name, value, on, remove }) {
  if (remove) return lines.filter((l) => l.name !== name);
  const text = quote(value);
  if (text === null) throw new Error(`${name}: a value on one line, without all three kinds of quotes in it`);
  const mine = lines.filter((l) => l.name === name), active = mine.filter((l) => !l.off), off = mine.filter((l) => l.off);
  const write = (l, on) => Object.assign(l, { value, off: !on, text: `${on ? "" : "#"}${name}=${text}` });
  if (on) {
    // the one Node takes, else the commented one of this value (one turned off a moment ago), else the last
    const line = active.at(-1) ?? off.findLast((l) => l.value === value) ?? off.at(-1);
    if (line) write(line, true);
    else add(lines, { text: `${name}=${text}`, name, value, off: false });
  } else if (active.length) {
    for (const l of active) Object.assign(l, { off: true, text: `#${name}=${quote(l.value) ?? ""}` });
    write(active.at(-1), false);
  } else if (off.length) write(off.findLast((l) => l.value === value) ?? off.at(-1), false);
  else add(lines, { text: `#${name}=${text}`, name, value, off: true });
  return lines;
}
// (at the end, before the blank lines the file ends with)
function add(lines, line) {
  let at = lines.length;
  while (at > 0 && !lines[at - 1].text.trim()) at--;
  lines.splice(at, 0, line);
}

const readEnv = () => fs.readFile(ENV_FILE, "utf8").catch(() => "");
const versionOf = (text) => hash(text).toString("hex").slice(0, 16);
// written whole, in place of the old one at once (its mode kept: 600 for a new one), the old one kept first
async function writeEnv(text) {
  const target = await fs.realpath(ENV_FILE).catch(() => ENV_FILE);
  const was = await fs.readFile(target, "utf8").catch(() => null);
  const mode = (await fs.stat(target).catch(() => null))?.mode & 0o777 || 0o600;
  if (was !== null) {
    await fs.mkdir(BACKUPS, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(BACKUPS, `${new Date().toISOString().replace(/[:.]/g, "-")}.env`), was, { mode: 0o600 });
    const old = (await fs.readdir(BACKUPS)).filter((f) => f.endsWith(".env")).sort();
    for (const f of old.slice(0, -KEEP)) await fs.unlink(path.join(BACKUPS, f)).catch(() => {});
  }
  const tmp = `${target}.panel-${process.pid}`;
  await fs.writeFile(tmp, text.endsWith("\n") || !text ? text : `${text}\n`, { mode });
  await fs.chmod(tmp, mode);
  await fs.rename(tmp, target);
}
// a setting as vvoid will be given it: the panel's own environment over the file (null: unset)
const effective = (name, settings) => process.env[name] ?? (settings.get(name)?.off === false ? settings.get(name).value : null);

// ---- what each setting is: found where it is read, and described where its README describes it ----
// (what vvoid reads, said in its README in prose, or read where no process.env names it)
const CORE = {
  ANTHROPIC_API_KEY: { about: "Claude's key (read by the Anthropic SDK); without one the void is made of local noise instead of dreams" },
  VVOID_PASSWORD: { about: "a password at every plugin's ring (VVOID_<NAME>_PASSWORD, over it, for one; see locks.js)" },
  VVOID_REMEMBER: { about: "how long a right password is remembered: 30d, 12h, 10m (unset: asked every time)" },
};
const SECRET = /KEY|TOKEN|PASSWORD|SECRET/;
const PROCESS_ENV = /process\.env(?:\.([A-Z][A-Z0-9_]*)|\[\s*["'`]([A-Z][A-Z0-9_]*)["'`]\s*\])/g;
const strip = (text) => text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\*\*|`/g, "").replace(/\s+/g, " ").trim();
// a README's descriptions: table rows (| `NAME` | default | what |) and list items (- `NAME`: what, and on)
function docsIn(text) {
  const docs = new Map();
  let last = null;
  for (const line of text.split("\n")) {
    const row = line.match(/^\|\s*`([A-Z][A-Z0-9_]*)`\s*\|([^|]*)\|([^|]*)\|/);
    const item = line.match(/^\s*[-*]\s+`([A-Z][A-Z0-9_]*)(?:=[^`]*)?`\s*:\s*(.*)$/);
    if (row) docs.set(row[1], { default: strip(row[2]), about: strip(row[3]) }), (last = null);
    else if (item && !docs.has(item[1])) docs.set(item[1], (last = { about: strip(item[2]) }));
    else if (last && /^\s{2,}\S/.test(line) && !/^\s*[-*|]/.test(line)) last.about += ` ${strip(line)}`;
    else last = null;
  }
  return docs;
}
async function namesIn(files) {
  const names = new Set();
  for (const file of files) {
    const text = await fs.readFile(file, "utf8").catch(() => "");
    for (const m of text.matchAll(PROCESS_ENV)) names.add(m[1] ?? m[2]);
  }
  return [...names].filter((n) => n.startsWith("VVOID_") || n === "PORT");
}
// a plugin's own code (not its page's, nor what it installed), two folders deep at most
async function codeOf(dir, depth = 0) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (e.isDirectory() && depth < 1 && !["node_modules", "public", ".git"].includes(e.name)) out.push(...(await codeOf(path.join(dir, e.name), depth + 1)));
    else if (e.isFile() && /\.m?js$/.test(e.name)) out.push(path.join(dir, e.name));
  }
  return out;
}
// what each plugin is, in a line or so: its item in plugins/README.md (- `name/`: ...), else its README's first words
function aboutPlugins(text) {
  const out = new Map();
  let last = null;
  for (const line of text.split("\n")) {
    const item = line.match(/^- `([\w-]+)\/`\s*:\s*(.*)$/);
    if (item) out.set(item[1], (last = { about: strip(item[2]) }));
    else if (last && /^\s{2,}\S/.test(line)) last.about += ` ${strip(line)}`;
    else last = null;
  }
  return new Map([...out].map(([k, v]) => [k, v.about]));
}

// the catalogue, made again as it is asked for (plugins come and go; it is quick)
async function catalogue() {
  const readme = docsIn(await fs.readFile(path.join(here, "README.md"), "utf8").catch(() => ""));
  const coreNames = new Set([
    ...Object.keys(CORE), ...readme.keys(),
    ...(await namesIn(["server.js", "locks.js", "slots.js", "admin.js"].map((f) => path.join(here, f)))),
  ]);
  const own = (name) => ({ name, ...CORE[name], ...readme.get(name) });
  const groups = [
    { id: "vvoid", title: "vvoid", entries: [...coreNames].filter((n) => !n.startsWith("VVOID_PANEL_")).map(own) },
    { id: "panel", title: "this panel", about: "read as the panel starts: restart it (npm run panel) for a change to count", entries: [...coreNames].filter((n) => n.startsWith("VVOID_PANEL_")).map(own) },
  ];
  const plugins = [];
  const abouts = aboutPlugins(await fs.readFile(path.join(PLUGINS, "README.md"), "utf8").catch(() => ""));
  const dirs = (await fs.readdir(PLUGINS, { withFileTypes: true }).catch(() => []))
    .filter((e) => e.isDirectory() && /^[\w-]+$/.test(e.name)).map((e) => e.name).sort();
  const taken = new Set(coreNames);
  const found = [];
  for (const name of dirs) {
    const dir = path.join(PLUGINS, name), env = `VVOID_${name.toUpperCase().replace(/-/g, "_")}`;
    const text = await fs.readFile(path.join(dir, "README.md"), "utf8").catch(() => "");
    const docs = docsIn(text);
    const names = new Set([...(await namesIn(await codeOf(dir))), ...[...docs.keys()].filter((n) => n === env || n.startsWith(`${env}_`))]);
    names.add(`${env}_PASSWORD`).add(`${env}_REMEMBER`); // (its lock: any plugin may have one)
    if (PORTAL_ORDER.includes(name)) names.add(`${env}_PORTAL`); // (and its portal's place, if it has one on the circle)
    found.push({ name, env, docs, names });
    const first = text.replace(/^#.*$/gm, "").split(/\n\s*\n/).map(strip).find(Boolean) ?? "";
    plugins.push({ name, about: abouts.get(name) ?? first, server: existsSync(path.join(dir, "server.js")), page: existsSync(path.join(dir, "public", "client.js")), portal: PORTAL_ORDER.includes(name) });
  }
  // (a name read by more than one plugin is the one's whose it is by its name, else the first's)
  for (const { name, env, docs, names } of found) {
    const entries = [];
    for (const n of [...names].sort((a, b) => (a === env ? -1 : b === env ? 1 : a.localeCompare(b)))) {
      if (taken.has(n) || (!n.startsWith(`${env}_`) && n !== env && found.some((o) => o.name !== name && (n === o.env || n.startsWith(`${o.env}_`))))) continue;
      taken.add(n);
      entries.push({
        name: n, ...docs.get(n),
        ...(n === `${env}_PASSWORD` && !docs.has(n) && { about: "a password at its ring (empty: open, whatever VVOID_PASSWORD says)" }),
        ...(n === `${env}_REMEMBER` && !docs.has(n) && { about: "how long its password is remembered: 30d, 12h (over VVOID_REMEMBER)" }),
        ...(n === `${env}_PORTAL` && !docs.has(n) && { default: "auto", about: "where its portal stands: angle,distance,height (degrees round the clock, 0 ahead as you arrive, 90 to the right; unset: in its place on the circle)" }),
      });
    }
    groups.push({ id: `plugin:${name}`, title: name, plugin: name, entries });
  }
  return { groups, plugins };
}

// the settings page's whole picture: each setting with its line's value, and the rest of .env as "other"
async function settings() {
  const text = await readEnv(), lines = parse(text), set = settingsOf(lines);
  const { groups, plugins } = await catalogue();
  const known = new Set(groups.flatMap((g) => g.entries.map((e) => e.name)));
  const others = [...set.keys()].filter((n) => !known.has(n)).map((name) => ({ name }));
  if (others.length) groups.push({ id: "other", title: "other", about: "in .env, and read by nothing the panel knows of", entries: others });
  for (const g of groups) for (const e of g.entries) {
    const l = set.get(e.name);
    Object.assign(e, { value: l?.value ?? "", on: l ? !l.off : false, exists: !!l, secret: SECRET.test(e.name) });
    if (process.env[e.name] !== undefined) e.shadowed = true; // (the panel's environment has its own, over the file)
  }
  const off = new Set((effective("VVOID_PLUGINS_OFF", set) ?? "").split(",").map((n) => n.trim()).filter(Boolean));
  for (const p of plugins) {
    const env = `VVOID_${p.name.toUpperCase().replace(/-/g, "_")}`;
    Object.assign(p, { off: off.has(p.name), locked: !!(effective(`${env}_PASSWORD`, set) ?? effective("VVOID_PASSWORD", set)) });
  }
  // (the circle of portals, for the plugins page's map: see hubSlot in constants.js)
  const ring = { order: PORTAL_ORDER, radius: PORTAL_RING, cell: CELL, reach: REACH * UNIT };
  return { version: versionOf(text), groups, plugins, ring };
}

// ---- the panel's own settings, as it starts ----
const startEnv = settingsOf(parse(await readEnv()));
const PORT = Number(effective("VVOID_PANEL_PORT", startEnv) || 5174);
const HOST = effective("VVOID_PANEL_HOST", startEnv) || "127.0.0.1";
const KEY = effective("VVOID_PANEL_KEY", startEnv) || randomBytes(18).toString("base64url");
const MADE_KEY = !effective("VVOID_PANEL_KEY", startEnv);

// ---- vvoid itself: started from here (and stopped with the panel), or found running elsewhere ----
let child = null, startedWith = null, startedAt = 0, ended = null, stopping = null;
const log = []; // { n, at, text, err } (the last LOG lines vvoid wrote, and what the panel said of it)
const LOG = 3000;
let logged = 0;
function note(text, err = false) {
  for (const line of text.split("\n")) {
    (err ? process.stderr : process.stdout).write(`${line}\n`); // (and here too, as npm start would say it)
    log.push({ n: ++logged, at: Date.now(), text: line, err });
    if (log.length > LOG) log.shift();
  }
}
function lines(stream, err) {
  let carry = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    const parts = (carry + chunk).split(/\r?\n/);
    carry = parts.pop();
    for (const p of parts) note(p, err);
    if (carry.length > 8192) note(carry, err), (carry = "");
  });
  stream.on("end", () => carry && note(carry, err));
}
async function start() {
  if (child) return;
  startedWith = versionOf(await readEnv());
  // (as npm start does: the panel's environment, and .env under it, read by vvoid itself)
  const run = spawn(process.execPath, ["--env-file-if-exists=.env", "server.js"], { cwd: here, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  child = run;
  startedAt = Date.now();
  ended = null;
  note(`── vvoid started (pid ${run.pid}) ──`);
  lines(run.stdout, false);
  lines(run.stderr, true);
  run.on("error", (err) => note(`── vvoid could not be started: ${err.message} ──`, true));
  run.on("exit", (code, signal) => {
    ended = { at: Date.now(), code, signal };
    note(`── vvoid ended (${signal ?? `code ${code}`}) ──`, !!code && !signal);
    if (child === run) child = null;
  });
}
// SIGTERM, and SIGKILL if it is still there after a while
function stop() {
  if (!child) return Promise.resolve();
  if (stopping) return stopping;
  const run = child;
  stopping = new Promise((resolve) => {
    const hard = setTimeout(() => run.kill("SIGKILL"), 6000);
    run.once("exit", () => (clearTimeout(hard), (stopping = null), resolve()));
    run.kill("SIGTERM");
  });
  return stopping;
}
// whether vvoid answers at its address (its settings as they are in .env now: for one started elsewhere, a guess)
let probed = { at: 0, up: false };
async function probe(set) {
  if (Date.now() - probed.at < 1000) return probed;
  const port = Number(effective("PORT", set) || 5173), host = effective("VVOID_HOST", set) || "127.0.0.1";
  const at = host === "0.0.0.0" ? "127.0.0.1" : host === "::" ? "::1" : host;
  const base = `http://${at.includes(":") ? `[${at}]` : at}:${port}`;
  const up = await fetch(`${base}/api/plugins`, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok, () => false);
  return (probed = { at: Date.now(), up, base, port });
}
async function vvoidState() {
  const text = await readEnv(), set = settingsOf(parse(text)), { up, base, port } = await probe(set);
  return {
    state: child ? (up ? "running" : "starting") : up ? "elsewhere" : "stopped",
    pid: child?.pid ?? null, startedAt: child ? startedAt : null, ended, port,
    stale: !!child && startedWith !== versionOf(text), // (.env changed since: a restart takes it up)
    base, url: base?.replace(/\/\/(127\.0\.0\.1|\[::1\])/, "//localhost"),
  };
}

// ---- the look: through vvoid while it runs (as an admin: its key is in .env), else in its file ----
async function look() {
  const set = settingsOf(parse(await readEnv())), { up, base } = await probe(set);
  const fields = LOOK.map(({ key, group, label, min, max, step, type, value }) => ({ key, group, label, min, max, step, type, value }));
  if (up) {
    const looks = await fetch(`${base}/api/look`, { signal: AbortSignal.timeout(3000) }).then((r) => r.json()).catch(() => null);
    if (looks) return { fields, looks, live: true, admin: !!effective("VVOID_ADMIN_KEY", set) };
  }
  return { fields, looks: await lookFile(set), live: false };
}
// ---- what each portal is, beside it in the hub (see about.js): its words, in VVOID_PORTALS; vvoid reads the
// file again as it changes, so they are seen without it restarting ----
const ABOUT_MAX = 2000; // (as server.js keeps them)
const portalsPath = (set) => path.resolve(here, effective("VVOID_PORTALS", set) ?? path.join(".cache", "portals.json"));
async function portalsFile(set) {
  try {
    const kept = JSON.parse(await fs.readFile(portalsPath(set), "utf8"));
    return kept && typeof kept === "object" ? kept : {};
  } catch {
    return {};
  }
}
async function setAbout(name, text) {
  const set = settingsOf(parse(await readEnv())), file = portalsPath(set), kept = await portalsFile(set);
  const about = { ...(kept.about ?? {}) };
  if (text.trim()) about[name] = text.slice(0, ABOUT_MAX);
  else delete about[name];
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.panel-${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify({ ...kept, about }, null, 2));
  await fs.rename(tmp, file);
  return about;
}

// and each portal's own word, its quick access (/<word> on vvoid's address goes straight to it: see VANITY in
// server.js), kept beside its words: lower case, never one of vvoid's own first steps, never another portal's
const VANITY = /^[a-z0-9][a-z0-9-]{0,39}$/, VANITY_TAKEN = new Set(["api", "src", "vendor", "plugins", "index", "panel", "admin"]);
async function setVanity(name, word) {
  const set = settingsOf(parse(await readEnv())), file = portalsPath(set), kept = await portalsFile(set);
  const vanity = { ...(kept.vanity ?? {}) };
  if (word) vanity[name] = word;
  else delete vanity[name];
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.panel-${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify({ ...kept, vanity }, null, 2));
  await fs.rename(tmp, file);
  return vanity;
}

const lookPath = (set) => path.resolve(here, effective("VVOID_LOOK", set) ?? path.join(".cache", "look.json"));
async function lookFile(set) {
  try {
    const kept = JSON.parse(await fs.readFile(lookPath(set), "utf8"));
    return cleanLooks(kept.now || kept.saves ? kept : { now: kept });
  } catch {
    return { now: {}, saves: {}, saber: [] };
  }
}
async function setLook(given) {
  const set = settingsOf(parse(await readEnv())), { up, base } = await probe(set);
  if (up) {
    const key = effective("VVOID_ADMIN_KEY", set);
    if (!key) return [409, { error: "vvoid is running without an admin key: set VVOID_ADMIN_KEY and restart it, or stop it, to change its look" }];
    // (an admin's cookie, as admin.js makes it from the key)
    const token = createHmac("sha256", key).update("vvoid admin").digest("hex");
    const r = await fetch(`${base}/api/look`, {
      method: "PUT", body: JSON.stringify(given), signal: AbortSignal.timeout(5000),
      headers: { "content-type": "application/json", "x-vvoid-lock": "1", cookie: `vvoid_admin=${token}` },
    }).catch((err) => ({ ok: false, status: 502, json: async () => ({ error: err.message }) }));
    const body = await r.json().catch(() => ({}));
    if (r.status === 403) return [409, { error: "vvoid's admin key is not the one in .env now: restart it" }];
    return r.ok ? [200, { looks: body, live: true }] : [r.status, { error: body.error ?? "vvoid did not take it" }];
  }
  const looks = cleanLooks(given, await lookFile(set)), file = lookPath(set);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(looks, null, 2));
  return [200, { looks, live: false }];
}

// ---- the way in ----
const sessions = new Map(); // token -> last used (ms)
const IDLE = 12 * 3_600_000;
const tries = new Map(); // address -> { fails, until }
let wrongs = [];
const TRIES = 5, COOLDOWN = 5 * 60_000;
function sessionOf(req) {
  const token = String(req.headers.authorization ?? "").match(/^Bearer ([\w-]{20,100})$/)?.[1];
  const at = token && sessions.get(token);
  if (!at || Date.now() - at > IDLE) return token && sessions.delete(token), null;
  sessions.set(token, Date.now());
  return token;
}
async function login(req, res) {
  const who = req.socket.remoteAddress ?? "?", now = Date.now();
  wrongs = wrongs.filter((at) => now - at < 60_000);
  const t = tries.get(who) ?? { fails: 0, until: 0 };
  if (now < t.until) return send(res, 429, { error: "too many wrong keys: wait a while" });
  if (wrongs.length >= 20) return send(res, 429, { error: "too many wrong keys: wait a minute" });
  const given = (await body(req, 2048).catch(() => null))?.key;
  if (typeof given === "string" && given.length < 1024 && timingSafeEqual(hash(given), hash(KEY))) {
    tries.delete(who);
    for (const [k, at] of sessions) if (now - at > IDLE) sessions.delete(k);
    const token = randomBytes(24).toString("base64url");
    sessions.set(token, now);
    console.log(`[panel] in, from ${who}`);
    return send(res, 200, { token });
  }
  t.fails = now >= t.until && t.until ? 1 : t.fails + 1;
  t.until = t.fails >= TRIES ? now + COOLDOWN : 0;
  tries.set(who, t);
  wrongs.push(now);
  console.log(`[panel] a wrong key from ${who}`);
  send(res, 403, { error: "wrong key" });
}

// ---- the server ----
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };
function send(res, status, value) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(value));
}
async function body(req, limit = 256 * 1024) {
  let text = "";
  for await (const chunk of req) if ((text += chunk).length > limit) throw new Error("too large");
  return JSON.parse(text);
}

const server = http.createServer(async (req, res) => {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("content-security-policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; form-action 'none'; frame-ancestors 'none'; base-uri 'none'");
  try {
    const url = new URL(req.url, "http://panel");
    const p = url.pathname, m = req.method;
    if (!p.startsWith("/api/")) {
      if (m !== "GET" && m !== "HEAD") return send(res, 405, { error: "no" });
      const file = { "/": "index.html", "/panel.js": "panel.js", "/panel.css": "panel.css", "/icon.svg": "icon.svg" }[p];
      if (!file) return send(res, 404, { error: "nothing here" });
      res.writeHead(200, { "content-type": TYPES[path.extname(file)], "cache-control": "no-cache" });
      return res.end(await fs.readFile(path.join(PUBLIC, file)));
    }
    if (p === "/api/login" && m === "POST") return await login(req, res);
    const token = sessionOf(req);
    if (!token) return send(res, 401, { error: "the key, first" });
    if (p === "/api/logout" && m === "POST") return sessions.delete(token), send(res, 200, {});

    if (p === "/api/state" && m === "GET") {
      const since = Number(url.searchParams.get("since") ?? 0);
      return send(res, 200, { vvoid: await vvoidState(), log: log.filter((l) => l.n > since), logged });
    }
    const act = p.match(/^\/api\/vvoid\/(start|stop|restart)$/)?.[1];
    if (act && m === "POST") {
      if (act !== "stop" && !child && (await probe(settingsOf(parse(await readEnv())))).up) {
        return send(res, 409, { error: "vvoid is running already, started elsewhere: stop it there first" });
      }
      if (act !== "start") await stop();
      if (act !== "stop") await start();
      probed.at = 0;
      return send(res, 200, await vvoidState());
    }

    if (p === "/api/settings" && m === "GET") return send(res, 200, await settings());
    if (p === "/api/settings" && m === "PUT") {
      const { base, edits } = await body(req);
      const text = await readEnv();
      if (base !== versionOf(text)) return send(res, 409, { error: ".env was changed elsewhere meanwhile: look again, then save" });
      if (!Array.isArray(edits)) return send(res, 400, { error: "bad request" });
      let lines = parse(text);
      for (const e of edits) {
        if (!e || typeof e.name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(e.name)) return send(res, 400, { error: "a setting's name is letters, digits and _" });
        if (!e.remove && typeof e.value !== "string") return send(res, 400, { error: `${e.name}: no value` });
        try {
          lines = change(lines, { name: e.name, value: e.value, on: !!e.on, remove: !!e.remove });
        } catch (err) {
          return send(res, 400, { error: err.message });
        }
      }
      await writeEnv(join(lines));
      console.log(`[panel] .env: ${edits.map((e) => e.name).join(", ")}`);
      return send(res, 200, await settings());
    }
    if (p === "/api/env" && m === "GET") {
      const text = await readEnv();
      return send(res, 200, { version: versionOf(text), text });
    }
    if (p === "/api/env" && m === "PUT") {
      const { base, text } = await body(req, 1024 * 1024);
      if (typeof text !== "string") return send(res, 400, { error: "bad request" });
      if (base !== versionOf(await readEnv())) return send(res, 409, { error: ".env was changed elsewhere meanwhile: look again, then save" });
      await writeEnv(text);
      console.log("[panel] .env: written whole");
      const now = await readEnv();
      return send(res, 200, { version: versionOf(now), text: now });
    }

    if (p === "/api/about" && m === "GET") {
      const kept = await portalsFile(settingsOf(parse(await readEnv())));
      return send(res, 200, { about: kept.about ?? {}, vanity: kept.vanity ?? {}, max: ABOUT_MAX });
    }
    if (p === "/api/vanity" && m === "PUT") {
      const { name, word: given } = await body(req, 4 * 1024);
      if (typeof name !== "string" || !/^[\w-]+$/.test(name) || typeof given !== "string") return send(res, 400, { error: "bad request" });
      const word = given.trim().toLowerCase().replace(/^\/+|\/+$/g, "");
      if (word && !VANITY.test(word)) return send(res, 400, { error: "a word of letters, digits and dashes, 40 at most, not starting with a dash" });
      if (VANITY_TAKEN.has(word)) return send(res, 400, { error: `/${word} is vvoid's own` });
      const kept = await portalsFile(settingsOf(parse(await readEnv())));
      const other = Object.entries(kept.vanity ?? {}).find(([n, w]) => n !== name && w === word);
      if (word && other) return send(res, 409, { error: `/${word} is ${other[0]}'s already` });
      const vanity = await setVanity(name, word);
      console.log(`[panel] ${name}: its quick access ${word ? `/${word}` : "taken away"}`);
      return send(res, 200, { about: kept.about ?? {}, vanity, max: ABOUT_MAX });
    }
    if (p === "/api/about" && m === "PUT") {
      const { name, text } = await body(req, 64 * 1024);
      if (typeof name !== "string" || !/^[\w-]+$/.test(name) || typeof text !== "string") return send(res, 400, { error: "bad request" });
      if (text.length > ABOUT_MAX) return send(res, 400, { error: `at most ${ABOUT_MAX} characters` });
      const about = await setAbout(name, text);
      console.log(`[panel] ${name}: its portal's words ${text.trim() ? "written" : "taken away"}`);
      return send(res, 200, { about, vanity: (await portalsFile(settingsOf(parse(await readEnv())))).vanity ?? {}, max: ABOUT_MAX });
    }
    if (p === "/api/look" && m === "GET") return send(res, 200, await look());
    if (p === "/api/look" && m === "PUT") {
      const given = await body(req, 512 * 1024).catch(() => null);
      if (!given || typeof given !== "object") return send(res, 400, { error: "bad request" });
      const [status, out] = await setLook(given);
      return send(res, status, out);
    }
    send(res, 404, { error: "nothing here" });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) send(res, 500, { error: err.message });
    else res.destroy();
  }
});

// the panel going, vvoid (if it started it) with it
let leaving = false;
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, async () => {
    if (leaving) process.exit(1);
    leaving = true;
    if (child) console.log("[panel] stopping vvoid");
    await stop();
    process.exit(0);
  });
}
process.on("exit", () => child?.kill("SIGTERM"));

server.on("error", (err) => {
  console.error(`[panel] ${err.code === "EADDRINUSE" ? `${HOST}:${PORT} is taken (VVOID_PANEL_PORT)` : err.message}`);
  process.exit(1);
});
server.listen(PORT, HOST, async () => {
  const shown = HOST === "0.0.0.0" || HOST === "::" ? "127.0.0.1" : HOST;
  const at = `http://${shown.includes(":") ? `[${shown}]` : shown}:${PORT}/`;
  console.log(`[panel] ${MADE_KEY ? `${at}#key=${KEY}  (a key for this run only: VVOID_PANEL_KEY sets one that stays)` : at}`);
  if (!/^(127\.|::1$|localhost$)/.test(HOST)) console.warn("[panel] open to more than this machine: put it behind https, or what is typed into it (keys and all) goes over the wire as it is");
  if (/^(1|on|yes|true)$/i.test(effective("VVOID_PANEL_START", startEnv) ?? "")) {
    if ((await probe(startEnv)).up) console.log("[panel] vvoid is running already (started elsewhere)");
    else await start(), console.log("[panel] vvoid started");
  }
});
