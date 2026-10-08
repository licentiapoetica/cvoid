// Admin: VVOID_ADMIN_KEY in vvoid's .env (unset: no one is). Open vvoid once as /?admin=<key>: the page gives
// the key here (POST /api/admin), and is given a cookie for vvoid's address that says so, for a year (a
// new key, and every cookie of the old one is worth nothing). An admin goes straight into the void, past
// the line (see slots.js), and through every plugin's lock without its password (see locks.js). /?admin=
// with nothing after it lets it go again (DELETE). Wrong keys: five from the same address, and it waits
// five minutes before it may try again; and the whole server takes at most twenty wrong ones a minute.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "vvoid_admin", FOR = 365 * 86_400; // s
const TRIES = 5, COOLDOWN = 5 * 60_000;
const hash = (text) => createHash("sha256").update(String(text)).digest();

export function makeAdmin(key, { send, readBody, whoIs }) {
  key = key ?? "";
  // what the cookie holds: the key, signed with itself (never the key; and nothing to keep on disk)
  const token = key && createHmac("sha256", key).update("vvoid admin").digest("hex");
  const tries = new Map(); // address -> { fails, until, last }
  let wrongs = []; // when each wrong key came, within the minute

  // whether a request is an admin's: its cookie
  const is = (req) => !!token && (req.headers.cookie ?? "").split(/;\s*/).some((c) => c.startsWith(`${COOKIE}=`) && timingSafeEqual(hash(c.slice(COOKIE.length + 1)), hash(token)));

  async function handle(req, res, url) {
    if (url.pathname !== "/api/admin") return false;
    if (req.method === "GET") return send(res, 200, { admin: is(req) }), true;
    // (asked from another page, a form posted from elsewhere, it is never ours: vvoid's page always says so)
    if (req.headers["x-vvoid-lock"] !== "1") return send(res, 403, { error: "not from vvoid's page" }), true;
    const scope = `Path=/; HttpOnly; SameSite=Strict${req.socket.encrypted || req.headers["x-forwarded-proto"] === "https" ? "; Secure" : ""}`;
    if (req.method === "DELETE") {
      res.writeHead(200, { "content-type": "application/json", "set-cookie": `${COOKIE}=; ${scope}; Max-Age=0` });
      return res.end(JSON.stringify({ admin: false })), true;
    }
    if (req.method !== "POST") return send(res, 405, { error: "no" }), true;
    const who = whoIs(req), now = Date.now();
    for (const [a, old] of tries) if (now >= old.until && now - old.last >= COOLDOWN) tries.delete(a); // (over, and a while ago: forgotten)
    wrongs = wrongs.filter((at) => now - at < 60_000);
    const t = tries.get(who) ?? { fails: 0, until: 0, last: 0 };
    if (now < t.until) return send(res, 429, { error: "too many wrong keys: wait a while" }), true;
    if (wrongs.length >= 20) return send(res, 429, { error: "too many wrong keys here: wait a minute" }), true;
    const given = (await readBody(req, 2048).catch(() => null))?.key;
    if (key && typeof given === "string" && given.length < 1024 && timingSafeEqual(hash(given), hash(key))) {
      tries.delete(who);
      res.writeHead(200, { "content-type": "application/json", "set-cookie": `${COOKIE}=${token}; ${scope}; Max-Age=${FOR}` });
      res.end(JSON.stringify({ admin: true }));
      console.log(`[vvoid] admin: in, from ${who}`);
      return true;
    }
    t.fails = now >= t.until && t.until ? 1 : t.fails + 1;
    t.until = t.fails >= TRIES ? now + COOLDOWN : 0;
    t.last = now;
    tries.set(who, t);
    wrongs.push(now);
    console.log(`[vvoid] admin: a wrong key from ${who} (${t.fails} in a row)`);
    send(res, 403, { error: key ? "wrong admin key" : "no admin key is set (VVOID_ADMIN_KEY)" });
    return true;
  }

  return { set: !!key, is, handle };
}
