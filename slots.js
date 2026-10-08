// Slots: how many may be in the void at once. VVOID_MAX_SLOTS in vvoid's .env (unset or 0: no limit).
// Every page asks now and then, GET /api/slots?id=<its id>, and is told { max, inside, queued, place, you,
// admin }: place null while it only looks on (the start screen), 0 once it is in, n while it is nth in line.
// Asking to come in (&join=1) takes a free slot, or a place at the end of the line; the line moves up as
// slots come free, first come first in. Asked so, again and again, a page keeps its slot (or its place):
// one that stops asking loses it (HELD, long enough for a tab in the background, which a browser lets ask
// only once a minute). A page closing says so (&leave=1): it is let go soon after (SOON), unless it is
// back by then (a reload). Nothing is held open between asks: every tab keeps the browser's few
// connections to vvoid's address free for the rest. An admin (see admin.js) is in at once, and takes no slot.
// One address (see whoIs in server.js) holds at most EACH slots and places in line together (a tab each):
// a page past that is only looking on, so that no one fills the void, or the line, alone.
const HELD = 150_000; // ms a slot, or a place in line, is kept without the page asking
const SOON = 15_000;  // ms, once the page has closed (in case it is a reload)
const EACH = 4;       // slots and places in line one address may hold

export function makeSlots(max, admin, whoIs) {
  max = Number.isInteger(max) && max > 0 ? max : 0;
  const inside = new Map(); // id -> kept until (ms)
  const queue = new Map();  // id -> kept until (ms), first in line first (a Map keeps its order)
  const whose = new Map();  // id -> the address holding it
  let made = 0;
  const fresh = () => `s${Date.now().toString(36)}${(made++).toString(36)}${Math.random().toString(36).slice(2, 8)}`;

  // the ones no longer asking let go, and the line moved up into whatever slots are free
  const sweep = () => {
    const now = Date.now();
    for (const kept of [inside, queue]) for (const [id, until] of kept) if (until < now) kept.delete(id);
    for (const id of whose.keys()) if (!inside.has(id) && !queue.has(id)) whose.delete(id);
    for (const id of queue.keys()) {
      if (max && inside.size >= max) break;
      inside.set(id, queue.get(id));
      queue.delete(id);
    }
  };

  return {
    max,
    // the route, /api/slots: true when it answered
    handle(req, res, url, send) {
      if (url.pathname !== "/api/slots") return false;
      let id = url.searchParams.get("id");
      if (!/^[\w-]{6,64}$/.test(id ?? "")) id = fresh(); // (a page new here is given its id)
      const join = url.searchParams.has("join"), leave = url.searchParams.has("leave"), boss = admin.is(req);
      sweep();
      if (leave) {
        for (const kept of [inside, queue]) if (kept.has(id)) kept.set(id, Math.min(kept.get(id), Date.now() + SOON));
        return send(res, 200, { ok: true }), true;
      }
      if (join && !boss) {
        const until = Date.now() + HELD, who = whoIs(req);
        const held = () => [...whose.values()].filter((w) => w === who).length;
        if (inside.has(id)) inside.set(id, until);
        else if (queue.has(id)) queue.set(id, until);
        else if (max && held() >= EACH) { /* (as many as one address may hold: only looking on) */ }
        else if (!max || (inside.size < max && !queue.size)) inside.set(id, until), whose.set(id, who);
        else queue.set(id, until), whose.set(id, who);
      }
      const place = !join ? null : boss || inside.has(id) ? 0 : queue.has(id) ? [...queue.keys()].indexOf(id) + 1 : null;
      res.setHeader("cache-control", "no-store");
      send(res, 200, { max, inside: inside.size, queued: queue.size, place, you: id, admin: boss });
      return true;
    },
  };
}
