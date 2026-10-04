// The void itself, speaking: now and then, seldom, a few words that form in the fog. It is an
// archivist (persona/void.md): it keeps everything, and over a long visit it starts keeping track of
// the traveller too. What it says is written by Claude from what the traveller has been doing (POST
// /api/void); a local script, filled in with the same real things, stands in when Claude is away.

const FIRST = 95;            // seconds of flight before it first speaks
const GAP = [150, 300];      // seconds between, after that
const LINE_SECONDS = 6.5;
const DWELL = 1.6;           // seconds of looking at something before it counts as handled

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// the stand-in: the same voice, with the real numbers and names put in
const LOCAL = {
  early: [
    () => "noted",
    () => "another visitor. i will find you a shelf",
    (j) => j.sectorName && `${j.sectorName.toLowerCase()}. catalogued`,
    () => "please do not touch what you cannot carry",
  ],
  middle: [
    (j) => j.handled.length && `${j.handled.at(-1).split(" ")[0]}. you held that one a while`,
    (j) => `${j.crossed} rooms. i counted them for you`,
    (j) => j.room && `the ${j.room.toLowerCase()} shelves are not in order yet`,
    () => "everything you looked at is still where you left it",
    () => "the other one moved something again",
  ],
  late: [
    () => "there is a shelf with your name. it is not full",
    (j) => j.handled.length && `i have you down beside ${j.handled.at(-1).split(" ")[0]}`,
    () => "nothing here is lost. it is only kept",
    () => "you have been here long enough to be catalogued",
    () => "the other one takes things. i only keep them",
  ],
};

export class VoidVoice {
  // notice: what the traveller is with, as the plugins see it (see main.js): { looked, picked } (each
  // { id, text }, text saying what it is), the room they are in and where that is (a phrase: "in
  // ..."), and whether something of theirs is open
  constructor({ world, notice, textEl, stored, store }) {
    Object.assign(this, { world, notice, textEl, store });
    this.state = { said: [], seconds: 0, ...stored("void", {}) };
    this.next = FIRST;
    this.crossed = 0;
    this.recent = [];
    this.lastKey = null;
    this.handled = [];        // things lingered on or picked out: "#id (what it is; how)"
    this.dwell = { id: null, time: 0 };
    this.speaking = 0;
    this.asking = false;
  }

  update(dt, speed, entitySpeaking) {
    this.state.seconds += dt;
    this.speaking = Math.max(0, this.speaking - dt);
    if (this.speaking === 0) this.textEl.classList.remove("show");
    // the rooms it is shown through
    const key = this.world.currentKey;
    if (key && key !== this.lastKey) {
      this.lastKey = key;
      this.crossed++;
      const name = this.world.currentSpec?.name;
      if (name && this.recent.at(-1) !== name) this.recent = [...this.recent, name].slice(-8);
    }
    // what is looked at a while, or picked out, it keeps
    const seen = (this.seen = this.notice?.() ?? {}), looked = seen.looked;
    if (looked && looked.id === this.dwell.id) {
      this.dwell.time += dt;
      if (this.dwell.time > DWELL && !this.dwell.kept) { this.dwell.kept = true; this.keep(looked, "looked at it a while"); }
    } else this.dwell = { id: looked?.id ?? null, time: 0 };
    const picked = seen.picked;
    if (picked && picked.id !== this.lastFocus) { this.lastFocus = picked.id; this.keep(picked, "picked it out"); }

    if ((this.next -= dt) > 0 || this.asking || entitySpeaking || seen.busy) return;
    this.next = rand(...GAP);
    this.speak(speed);
  }

  keep(thing, how) {
    const entry = `#${thing.id} (${thing.text}; ${how})`;
    this.handled = [...this.handled.filter((h) => !h.startsWith(`#${thing.id} `)), entry].slice(-8);
  }

  journey(speed) {
    return {
      minutes: this.state.seconds / 60, crossed: this.crossed, realm: this.world.realm,
      sector: (this.world.currentKey ?? "0,0,0").replace(/^\w:/, "").split(",").map(Number),
      sectorName: this.world.currentSpec?.name, recent: this.recent, room: this.seen?.room ?? null, place: this.seen?.place ?? null,
      handled: this.handled, said: this.state.said,
      motion: speed < 6 ? "standing still" : speed > 250 ? "rushing" : "drifting",
    };
  }

  async speak(speed) {
    this.asking = true;
    const journey = this.journey(speed);
    let lines = null;
    if (!this.world.offline) {
      try {
        const res = await fetch("/api/void", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(journey) });
        if (res.ok) lines = (await res.json()).lines;
      } catch { /* the stand-in */ }
    }
    lines ??= this.local(journey);
    this.asking = false;
    if (!lines?.length) return;
    this.state.said = [...this.state.said, ...lines].slice(-14);
    this.store("void", this.state);
    this.show(lines);
  }

  local(journey) {
    const tier = journey.minutes < 8 ? "early" : journey.minutes < 25 ? "middle" : "late";
    const fresh = LOCAL[tier].map((line) => line(journey)).filter((l) => l && !this.state.said.includes(l));
    return fresh.length ? [pick(fresh)] : null;
  }

  // the words form in the fog, letter by letter, and stay a while
  show(lines) {
    this.textEl.replaceChildren(...lines.map((line, n) => {
      const row = document.createElement("div");
      [...line].forEach((ch, i) => {
        const letter = document.createElement("span");
        letter.textContent = ch;
        letter.style.animationDelay = `${(n * 1.4 + i * 0.045).toFixed(2)}s`;
        row.append(letter);
      });
      return row;
    }));
    this.textEl.classList.add("show");
    this.speaking = LINE_SECONDS + lines.length * 1.6;
  }
}
