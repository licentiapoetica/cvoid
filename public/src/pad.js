// The controller, as the player has it: which buttons (of the browser's standard layout) each
// action is on, remembered in the browser, and changed on the controller page of the Tab panel
// (click an action, press the button). Flying (main.js) and the plugins' own actions (see addActions)
// ask it what was pressed, rather than knowing the buttons themselves.

// [group, id, what it does, the buttons it is on unless the player says otherwise]
export const ACTIONS = [
  ["flight", "rise", "rise", [7]],
  ["flight", "sink", "sink", [6]],
  ["flight", "interact", "open or enter what you look at, else recentre", [2]],
  ["flight", "surge", "surge", [0, 10]],
  ["flight", "rollLeft", "roll left", [4]],
  ["flight", "rollRight", "roll right", [5]],
  ["flight", "autofly", "autofly", [12]],
  ["flight", "zoom", "zoom (held)", [11]],
  ["flight", "levelOut", "recentre the view", []],
  ["flight", "map", "map", [8]],
  ["flight", "layerUp", "map layer up", [5]],
  ["flight", "layerDown", "map layer down", [4]],
  ["flight", "slower", "look slower", [14]],
  ["flight", "faster", "look faster", [15]],
  ["flight", "invert", "invert look", []],
  ["flight", "mute", "mute", [3]],
].map(([group, id, label, buttons]) => ({ group, id, label, buttons }));
const GROUPS = { flight: "flying" };

// what the buttons are called on the controller in hand
const PLAYSTATION = ["✕", "○", "□", "△", "L1", "R1", "L2", "R2", "create", "options", "L3", "R3", "d-pad up", "d-pad down", "d-pad left", "d-pad right", "PS", "touchpad"];
const XBOX = ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "view", "menu", "LS", "RS", "d-pad up", "d-pad down", "d-pad left", "d-pad right", "home"];
const isPlayStation = (id) => /054c|sony|playstation|dualsense|dualshock|wireless controller/i.test(id ?? "");
const valid = (list) => (Array.isArray(list) && list.every((i) => Number.isInteger(i) && i >= 0 && i < 32) ? [...new Set(list)] : null);

export class PadMap {
  constructor({ stored, store }) {
    this.store = store;
    const saved = stored("pad", {});
    this.actions = [...ACTIONS];     // cvoid's own, and what plugins add (see addActions)
    this.groups = { ...GROUPS };
    this.saved = saved?.bound ?? {}; // (the plugins' are read from here as they add theirs)
    this.bound = Object.fromEntries(ACTIONS.map((a) => [a.id, valid(this.saved[a.id]) ?? [...a.buttons]]));
    // saved before square became the interact button (it was invert look, and d-pad up levelled out):
    // what still sits where it used to by default moves as the defaults did; the rest stays as it was set
    if ((saved?.version ?? 0) < 3) {
      if (`${this.bound.levelOut}` === "12" || `${this.bound.levelOut}` === "11") this.bound.levelOut = [];
      if (`${this.bound.autofly}` === "12") this.bound.autofly = [11];
      if (`${this.bound.invert}` === "2") this.bound.invert = [];
    }
    // saved before R3 zoomed (it was autofly's): autofly, still there, goes to d-pad up
    if ((saved?.version ?? 0) < 4 && `${this.bound.autofly}` === "11") this.bound.autofly = [12];
    this.swap = !!saved?.swap; // the sticks the other way round: the right one flies, the left one looks
    this.names = PLAYSTATION;
    this.id = "";
    this.index = null;
    this.now = new Set();    // buttons down this frame
    this.newly = new Set();  // and only just pressed
    this.gone = new Set();   // and only just let go
    this.taken = new Set();  // held buttons a plugin has used (see take): nothing else hears them until let go
    this.capturing = null;   // { id, add }: the next button pressed goes to this action
    this.onChange = null;
  }

  save() {
    this.store("pad", { version: 4, bound: this.bound, swap: this.swap });
    this.onChange?.(); // (the page drawn again)
    this.onSaved?.();  // (and the help line: see main.js)
  }

  // once a frame, with the controller in use: what is down, what was just pressed and let go
  frame(gp) {
    const now = new Set(gp.buttons.flatMap((b, i) => (b.pressed ? [i] : [])));
    if (gp.index !== this.index || gp.id !== this.id) {
      // another controller: what it already holds is not a press, and its buttons have its names
      this.index = gp.index;
      this.id = gp.id;
      this.names = isPlayStation(gp.id) ? PLAYSTATION : XBOX;
      this.now = now;
      this.onChange?.();
    }
    this.newly = new Set([...now].filter((i) => !this.now.has(i)));
    this.gone = new Set([...this.now].filter((i) => !now.has(i)));
    this.now = now;
    for (const i of this.taken) if (!now.has(i)) this.taken.delete(i);
  }

  // A plugin's own actions, in a group of their own on the controller page (added once: two plugins
  // sharing a group, as f0ck and 4chan share their tour, give it once). [id, what it does, buttons]
  addActions(group, title, list) {
    if (this.groups[group]) return;
    this.groups[group] = title;
    for (const [id, label, buttons] of list) {
      this.actions.push({ group, id, label, buttons });
      this.bound[id] = valid(this.saved[id]) ?? [...buttons];
    }
    this.onChange?.();
  }

  // An action's press, used by whoever asks first (plugins are asked before cvoid's own flying): its
  // buttons are then not pressed, nor held, for anything else until they are let go. True if it was pressed.
  take(id) {
    if (!this.hit(id)) return false;
    for (const i of this.buttons(id)) {
      this.newly.delete(i);
      if (this.now.has(i)) this.taken.add(i);
    }
    return true;
  }

  buttons(id) {
    return this.bound[id] ?? [];
  }
  down(id) {
    return this.buttons(id).some((i) => this.now.has(i) && !this.taken.has(i));
  }
  hit(id) {
    return this.buttons(id).some((i) => this.newly.has(i));
  }
  released(id) {
    return this.buttons(id).some((i) => this.gone.has(i)) && !this.down(id);
  }
  // how far a button is pushed in (the triggers), 0..1
  value(gp, id) {
    return Math.max(0, ...this.buttons(id).map((i) => gp.buttons[i]?.value ?? 0));
  }
  // the sticks: one flies (or moves, in a plugin's game), the other looks
  sticks(gp) {
    const left = [gp.axes[0] ?? 0, gp.axes[1] ?? 0], right = [gp.axes[2] ?? 0, gp.axes[3] ?? 0];
    return this.swap ? { move: right, aim: left } : { move: left, aim: right };
  }

  name(i) {
    return this.names[i] ?? `button ${i}`;
  }
  // an action's buttons, by name
  named(id) {
    return this.buttons(id).map((i) => this.name(i)).join(" ") || "none";
  }
  // the help for a group (see showHelp in main.js), each entry its buttons and what they do:
  // [["sticks", "fly and look"], ["✕ L3", "surge"], ...]; move: what the moving stick does instead of
  // flying (a plugin's game: "move"), each stick then named on its own
  help(group, move = null) {
    const sticks = move ? [[`${this.swap ? "right" : "left"} stick`, move], [`${this.swap ? "left" : "right"} stick`, "look"]] : [["sticks", `fly and look${this.swap ? " (swapped)" : ""}`]];
    return [...sticks, ...this.actions.filter((a) => a.group === group && this.buttons(a.id).length).map((a) => [this.named(a.id), a.label])];
  }

  // the controller page: the next button pressed goes to an action (in place of its buttons, or beside them)
  capture(id, add = false) {
    this.capturing = { id, add, until: performance.now() + 8000 };
    this.onChange?.();
  }
  cancel() {
    this.capturing = null;
    this.onChange?.();
  }
  // each frame: true while a button is being waited for (nothing else is done with the controller)
  waiting() {
    const c = this.capturing;
    if (!c) return false;
    if (performance.now() > c.until) return this.cancel(), false;
    const [button] = this.newly;
    if (button === undefined) return true;
    this.bound[c.id] = c.add ? [...new Set([...this.buttons(c.id), button])] : [button];
    this.capturing = null;
    this.save();
    return true;
  }
  clear(id) {
    this.bound[id] = [];
    this.save();
  }
  reset() {
    for (const a of this.actions) this.bound[a.id] = [...a.buttons];
    this.swap = false;
    this.save();
  }
  toggleSwap() {
    this.swap = !this.swap;
    this.save();
  }

  // The controller page, in the given element: each action and its buttons. A click on the buttons
  // waits for the one to put it on, + for one to add; right click clears it.
  bindPanel(el, connected) {
    const make = (tag, props = {}, ...children) => {
      const e = Object.assign(document.createElement(tag), props);
      e.append(...children);
      return e;
    };
    const draw = () => {
      const rows = [];
      rows.push(make("div", { className: "title" }, "controller"));
      rows.push(make("div", { className: "which" }, connected() ? this.id || "a controller" : "no controller found: connect one and press a button on it"));
      for (const [group, title] of Object.entries(this.groups)) {
        rows.push(make("div", { className: "of" }, title));
        const list = make("div", { className: "binds" });
        for (const a of this.actions.filter((x) => x.group === group)) {
          const waiting = this.capturing?.id === a.id;
          const set = make("button", { className: `set${waiting ? " on" : ""}`, title: "click, then press a button · right click clears", onclick: () => this.capture(a.id) }, waiting ? "press a button" : this.named(a.id));
          set.oncontextmenu = (e) => { e.preventDefault(); this.clear(a.id); };
          const add = make("button", { className: "add", title: "add another button", onclick: () => this.capture(a.id, true) }, "+");
          list.append(make("span", {}, a.label), set, add);
        }
        rows.push(list);
      }
      const swap = make("button", { className: this.swap ? "on" : "", onclick: () => this.toggleSwap() }, "swap sticks");
      const reset = make("button", { onclick: () => this.reset() }, "reset all");
      rows.push(make("div", { className: "row" }, swap, reset));
      el.replaceChildren(...rows);
    };
    this.onChange = draw;
    draw();
    return draw;
  }
}
