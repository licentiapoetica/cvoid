// Slots, the page's side (the server's is slots.js, beside server.js): how many are in the void and how
// many it takes (VVOID_MAX_SLOTS), on the start screen; and, the void full, a place in line, the page
// going in by itself the moment a slot comes free. No limit set: nothing shown, and nothing waited for.
// It asks now and then (nothing held open: a browser has only a few connections to vvoid's address, for
// every tab of it together). An admin (VVOID_ADMIN_KEY, see admin.js) opens vvoid once as /?admin=<key>:
// this browser is given a cookie, and goes straight in, and through every portal without its password.
const SAID = { "x-vvoid-lock": "1" }; // (as locks.js: a request that changes something says it comes from this page)
const EVERY = 3; // s between asks, in line or in (a tab in the background: as often as its browser lets it)
const LOOKING = 6; // s between asks, only looking on (the start screen)
const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th");

export class Slots {
  // come(): going in, once a slot is this page's
  constructor(come) {
    this.come = come;
    this.max = null;      // the limit (0: none; null: not heard yet)
    this.in = false;      // a slot is this page's
    this.joined = false;  // asked to come in: in line, or in
    this.wanted = false;  // and not in yet (it goes in by itself, once it is)
    this.admin = false;
    this.said = "";       // a word on the admin key given, for a while
    this.el = document.getElementById("slots");
    // its id: kept over a reload (to come back to its own slot), not taken by a duplicated tab (it is
    // taken out as the page opens, and put back only as it closes)
    try { this.id = sessionStorage.getItem("vvoid.slot") ?? ""; sessionStorage.removeItem("vvoid.slot"); } catch { this.id = ""; }
    addEventListener("pagehide", () => {
      try { sessionStorage.setItem("vvoid.slot", this.id); } catch { /* private mode: a reload is a newcomer */ }
      if (this.joined) navigator.sendBeacon?.(`/api/slots?id=${encodeURIComponent(this.id)}&leave=1`);
    });
    this.login().then(() => this.ask());
  }
  // /?admin=<key>: given to the server once (its cookie is what says so from then on), and out of the
  // address bar; /?admin= with nothing: let go
  async login() {
    const url = new URL(location.href), key = url.searchParams.get("admin");
    if (key === null) return;
    url.searchParams.delete("admin");
    history.replaceState(history.state, "", url);
    const res = await fetch("/api/admin", key ? { method: "POST", headers: { ...SAID, "content-type": "application/json" }, body: JSON.stringify({ key }) } : { method: "DELETE", headers: SAID }).catch(() => null);
    const data = await res?.json().catch(() => null);
    this.said = !res ? "the server does not answer" : res.ok ? (data?.admin ? "admin" : "admin no more") : data?.error ?? "refused";
    setTimeout(() => { this.said = ""; this.show(); }, 6000);
  }
  async ask() {
    clearTimeout(this.timer);
    // (given up on after a while: behind the browser's few connections to vvoid, all busy with places being
    // dreamt, an ask could wait a minute; the next one goes out on time instead)
    const res = await fetch(`/api/slots?id=${encodeURIComponent(this.id)}${this.joined ? "&join=1" : ""}`, { cache: "no-store", signal: AbortSignal.timeout(EVERY * 1000) }).catch(() => null);
    if (res?.status === 404) return this.heard({ max: 0 }); // (a server without slots: as if there were no limit)
    const data = res?.ok && (await res.json().catch(() => null));
    if (data) this.heard(data);
    if (this.max !== 0) this.timer = setTimeout(() => this.ask(), (this.joined ? EVERY : LOOKING) * 1000);
  }
  heard({ max, inside, queued, place, you, admin }) {
    if (you) this.id = you;
    this.max = max;
    this.admin = !!admin;
    this.in = !max || (this.joined && place === 0);
    this.counts = { inside, queued, place };
    this.show();
    if (this.in && this.wanted) {
      this.wanted = false;
      this.come();
    }
  }
  // Asked to come in: true when it may now; else it waits in line, and come() is called when it may. Unless
  // the void is known to be full (the last answer said so), it goes in at once and its slot is taken on the
  // way: waiting for the server's answer first, the start screen stayed while that ask waited behind the
  // browser's connections (busy with places being dreamt), sometimes for a minute.
  enter() {
    if (this.in) return true;
    if (!this.joined) {
      this.joined = true;
      this.ask();
    }
    const { inside = 0, queued = 0 } = this.counts ?? {};
    if (!this.max || (inside < this.max && !queued)) return (this.in = true);
    this.wanted = true;
    return false;
  }
  show() {
    const { inside = 0, queued = 0, place = null } = this.counts ?? {};
    const waiting = this.wanted && place > 0;
    document.body.classList.toggle("queued", waiting);
    document.title = waiting ? `${ordinal(place)} in line · vvoid` : "vvoid";
    const words = [];
    if (this.max) {
      const full = inside >= this.max;
      words.push(waiting ? `the void is full · you are ${ordinal(place)} in line` : `${inside} of ${this.max} inside${queued ? ` · ${queued} waiting` : full ? " · full" : ""}`);
      this.el.classList.toggle("full", full && !this.in && !this.admin);
    }
    if (this.said || this.admin) words.push(this.said || "admin");
    this.el.textContent = words.join(" · ");
  }
}
