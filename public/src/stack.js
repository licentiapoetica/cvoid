// The falling-block game itself, with no drawing and no sound: a 10 x 20 well, the seven
// tetrominoes dealt from shuffled bags, SRS rotation with its wall kicks, hold, ghost, lock delay,
// guideline gravity and scoring, T-spins, and the Zone: stop time, and every line cleared
// meanwhile piles up at the bottom until it all goes at once.
//
// Rows count up from the floor (y = 0 is the bottom row), so wall kicks read as they are published.
// The game reports what happens through `events`, which whoever draws and plays it drains each frame.

export const W = 10, H = 20, TOP = 40; // well width, visible rows, rows kept in all
export const TYPES = ["I", "J", "L", "O", "S", "T", "Z"];

// spawn orientation, drawn top row first
const SHAPES = {
  I: ["....", "XXXX", "....", "...."],
  J: ["X..", "XXX", "..."],
  L: ["..X", "XXX", "..."],
  O: [".XX", ".XX", "..."],
  S: [".XX", "XX.", "..."],
  T: [".X.", "XXX", "..."],
  Z: ["XX.", ".XX", "..."],
};

// CELLS[type][rotation] = [[column, row-from-top], ...] inside the piece's box. Clockwise: (c, r) -> (n-1-r, c).
const CELLS = Object.fromEntries(TYPES.map((type) => {
  const rows = SHAPES[type], n = rows.length;
  let cells = [];
  rows.forEach((row, r) => [...row].forEach((ch, c) => ch === "X" && cells.push([c, r])));
  const turns = [cells];
  for (let i = 1; i < 4; i++) turns.push(cells = type === "O" ? cells : cells.map(([c, r]) => [n - 1 - r, c]));
  return [type, turns];
}));

// SRS wall kicks, (dx, dy) with y up, tried in order. Rotations: 0 spawn, 1 right, 2 reversed, 3 left.
const KICKS = {
  "0>1": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]], "1>0": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  "1>2": [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]], "2>1": [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  "2>3": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]], "3>2": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  "3>0": [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]], "0>3": [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const KICKS_I = {
  "0>1": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]], "1>0": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  "1>2": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]], "2>1": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  "2>3": [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]], "3>2": [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  "3>0": [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]], "0>3": [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

const LOCK_DELAY = 0.5, MOVE_RESETS = 15;
const DAS = 0.167, ARR = 0.033, SOFT = 20; // auto-shift delay and rate (seconds), soft drop speed-up
const LINE_POINTS = [0, 100, 300, 500, 800];
const TSPIN_POINTS = [400, 800, 1200, 1600], MINI_POINTS = [100, 200, 400];
const CLEAR_POINTS = [0, 800, 1200, 1800, 2000]; // a perfect clear: nothing left in the well
export const ZONE_LINES = 24;   // lines that fill the Zone meter
export const ZONE_SECONDS = 20; // how long a full meter stops time for

// seconds per row at a level (the guideline curve), never faster than one row a frame
export const gravity = (level) => Math.max(1 / 60, (0.8 - (level - 1) * 0.007) ** (level - 1));

export class Stack {
  constructor(random = Math.random) {
    this.random = random;
    this.events = [];
    this.state = "ready"; // ready, playing, over
    this.reset();
  }

  reset() {
    this.rows = Array.from({ length: TOP }, () => Array(W).fill(null)); // a cell holds its piece's type, or "zone"
    this.bag = [];
    this.queue = [];
    this.hold = null;
    this.held = false; // hold is used once per piece
    this.piece = null;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.combo = -1;
    this.b2b = false;
    this.time = 0;
    this.fall = 0;
    this.lockTimer = 0;
    this.resets = 0;
    this.lowest = Infinity;
    this.meter = 0;     // 0..1, the Zone meter
    this.zone = 0;      // seconds of Zone left; 0 when it is not on
    this.zoneLines = 0; // lines piled at the bottom during this Zone
    this.input = { left: false, right: false, soft: false, dir: 0, das: 0, arr: 0 };
  }

  start() {
    this.reset();
    this.state = "playing";
    this.fillQueue();
    this.spawn();
    this.emit("start");
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  fillQueue() {
    while (this.queue.length < 7) {
      if (!this.bag.length) {
        this.bag = [...TYPES];
        for (let i = this.bag.length - 1; i > 0; i--) {
          const j = Math.floor(this.random() * (i + 1));
          [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
        }
      }
      this.queue.push(this.bag.pop());
    }
  }

  next(count = 5) {
    return this.queue.slice(0, count);
  }

  // where a piece's four minos are on the board
  cells(piece = this.piece, dx = 0, dy = 0, rot = piece.rot) {
    return CELLS[piece.type][rot].map(([c, r]) => [piece.x + dx + c, piece.y + dy - r]);
  }

  blocked(x, y) {
    return x < 0 || x >= W || y < 0 || (y < TOP && this.rows[y][x] !== null);
  }

  fits(piece, dx = 0, dy = 0, rot = piece.rot) {
    return this.cells(piece, dx, dy, rot).every(([x, y]) => !this.blocked(x, y));
  }

  spawn(type = null) {
    if (!type) {
      type = this.queue.shift();
      this.fillQueue();
      this.held = false; // a fresh piece from the queue may be held again
    }
    // the box's top row sits on row 22, so the piece appears just above the visible well
    this.piece = { type, rot: 0, x: 3, y: H + 1, kick: 0, spun: false };
    this.fall = 0;
    this.lockTimer = 0;
    this.resets = 0;
    this.lowest = this.piece.y;
    if (!this.fits(this.piece)) return this.over("block out");
    if (this.fits(this.piece, 0, -1)) this.piece.y--; // and drops into view at once
    this.emit("spawn", { piece: type });
  }

  over(reason) {
    this.state = "over";
    if (this.zone) this.endZone();
    this.emit("over", { reason, score: this.score });
  }

  // the last stage of a journey is done: the run ends, won
  finish() {
    if (this.state !== "playing") return;
    if (this.zone) this.endZone();
    this.state = "over";
    this.emit("over", { reason: "journey", score: this.score });
  }

  // ---- what the player does ----

  press(action) {
    if (this.state !== "playing" || !this.piece) return;
    const input = this.input;
    switch (action) {
      case "left":
      case "right": {
        const dir = action === "left" ? -1 : 1;
        input[action] = true;
        input.dir = dir;
        input.das = 0;
        input.arr = 0;
        this.shift(dir);
        break;
      }
      case "soft": input.soft = true; break;
      case "hard": this.hardDrop(); break;
      case "cw": this.rotate(1); break;
      case "ccw": this.rotate(3); break;
      case "flip": this.rotate(2); break;
      case "hold": this.swap(); break;
      case "zone": this.startZone(); break;
    }
  }

  release(action) {
    const input = this.input;
    if (action === "left" || action === "right") {
      input[action] = false;
      // let go of one direction while the other is still held: that one takes over
      input.dir = input.left ? -1 : input.right ? 1 : 0;
      input.das = 0;
    }
    if (action === "soft") input.soft = false;
  }

  shift(dir) {
    if (!this.fits(this.piece, dir, 0)) return false;
    this.piece.x += dir;
    this.piece.spun = false;
    this.moved();
    this.emit("move", { x: this.piece.x, dir });
    return true;
  }

  rotate(turn) {
    const piece = this.piece, to = (piece.rot + turn) % 4;
    if (piece.type === "O") return this.emit("rotate", { piece: "O", rot: to, kick: 0 }); // nothing to turn
    const kicks = turn === 2 ? [[0, 0], [0, 1], [1, 0], [-1, 0]] : (piece.type === "I" ? KICKS_I : KICKS)[`${piece.rot}>${to}`];
    for (let i = 0; i < kicks.length; i++) {
      const [dx, dy] = kicks[i];
      if (!this.fits(piece, dx, dy, to)) continue;
      piece.x += dx;
      piece.y += dy;
      piece.rot = to;
      piece.spun = true;
      piece.kick = i;
      this.moved();
      this.emit("rotate", { piece: piece.type, rot: to, kick: i, turn });
      return true;
    }
    return false;
  }

  // a successful move on the ground buys more time before it locks, up to a point
  moved() {
    if (this.fits(this.piece, 0, -1)) return;
    if (this.resets < MOVE_RESETS) {
      this.resets++;
      this.lockTimer = 0;
    }
  }

  swap() {
    if (this.held) return;
    const type = this.piece.type, out = this.hold;
    this.hold = type;
    this.spawn(out);
    this.held = true;
    this.emit("hold", { piece: type });
  }

  ghost() {
    let dy = 0;
    while (this.fits(this.piece, 0, dy - 1)) dy--;
    return this.cells(this.piece, 0, dy);
  }

  hardDrop() {
    let rows = 0;
    while (this.fits(this.piece, 0, -1)) {
      this.piece.y--;
      rows++;
    }
    if (rows) this.piece.spun = false;
    this.score += rows * 2;
    this.emit("drop", { rows, cells: this.cells() });
    this.lock();
  }

  // ---- time ----

  update(dt) {
    if (this.state !== "playing" || !this.piece) return;
    this.time += dt;
    const input = this.input;
    if (input.dir) {
      input.das += dt;
      if (input.das >= DAS) {
        input.arr += dt;
        while (input.arr >= ARR) {
          input.arr -= ARR;
          if (!this.shift(input.dir)) { input.arr = 0; break; }
        }
      }
    }
    if (this.zone) {
      // time has stopped: nothing falls by itself, though a piece pushed to the floor still locks
      this.zone = Math.max(0, this.zone - dt);
      if (!this.zone) return this.endZone();
    }
    const grounded = !this.fits(this.piece, 0, -1);
    if (!grounded) {
      const step = this.zone ? (input.soft ? gravity(1) / SOFT : Infinity) : input.soft ? Math.min(gravity(this.level), gravity(1) / SOFT) : gravity(this.level);
      this.fall += dt;
      while (this.fall >= step && this.fits(this.piece, 0, -1)) {
        this.fall -= step;
        this.piece.y--;
        this.piece.spun = false;
        if (input.soft) this.score += 1;
        if (this.piece.y < this.lowest) {
          this.lowest = this.piece.y;
          this.resets = 0; // a new lowest row starts the move allowance over
        }
      }
      if (!this.fits(this.piece, 0, -1)) this.fall = 0;
      this.lockTimer = 0;
    } else if ((this.lockTimer += dt) >= LOCK_DELAY) {
      this.lock();
    }
  }

  // ---- landing ----

  // A T that last moved by turning, with three of the four corners around its centre filled.
  // The full spin needs both corners it points at, or the last kick of the table.
  tspin() {
    const p = this.piece;
    if (p.type !== "T" || !p.spun) return null;
    const cx = p.x + 1, cy = p.y - 1;
    const corner = ([dx, dy]) => this.blocked(cx + dx, cy + dy);
    const corners = [[-1, 1], [1, 1], [1, -1], [-1, -1]]; // clockwise from top left
    if (corners.filter(corner).length < 3) return null;
    const front = [corners[(p.rot + 0) % 4], corners[(p.rot + 1) % 4]]; // the two corners on the side it points to
    return front.every(corner) || p.kick === 4 ? "full" : "mini";
  }

  lock() {
    const piece = this.piece, cells = this.cells();
    const spin = this.tspin();
    if (cells.every(([, y]) => y >= H)) return this.over("lock out"); // landed wholly above the well
    for (const [x, y] of cells) if (y < TOP) this.rows[y][x] = piece.type;
    this.emit("lock", { piece: piece.type, cells });
    this.piece = null;

    // full rows, not counting the Zone's own pile at the bottom
    const full = [];
    for (let y = this.zoneLines; y < TOP; y++) if (this.rows[y].every((c) => c !== null)) full.push(y);
    const n = full.length;
    const cleared = full.map((y) => ({ y, cells: [...this.rows[y]] }));

    if (this.zone) {
      // in the Zone cleared rows are not gone: they sink to the bottom and wait there
      if (n) {
        for (const y of [...full].reverse()) this.rows.splice(y, 1);
        for (let i = 0; i < n; i++) this.rows.splice(this.zoneLines, 0, Array(W).fill("zone"));
        this.zoneLines += n;
        this.emit("zoneLines", { rows: cleared, total: this.zoneLines });
      }
      this.combo = n ? this.combo + 1 : -1;
      return this.spawn();
    }

    let points = 0, label = "";
    if (spin === "full") {
      points = TSPIN_POINTS[n];
      label = ["T-spin", "T-spin single", "T-spin double", "T-spin triple"][n];
    } else if (spin === "mini") {
      points = MINI_POINTS[Math.min(n, 2)];
      label = n ? `mini T-spin ${["", "single", "double"][n]}` : "mini T-spin";
    } else {
      points = LINE_POINTS[n];
      label = ["", "single", "double", "triple", "quad"][n];
    }
    // back to back: a quad or a spin that clears, after another
    const hard = n > 0 && (n === 4 || spin);
    if (hard && this.b2b) {
      points *= 1.5;
      label = `back-to-back ${label}`;
    }
    if (n) this.b2b = hard;
    this.combo = n ? this.combo + 1 : -1;
    points += this.combo > 0 ? 50 * this.combo : 0;

    if (n) {
      for (const y of [...full].reverse()) this.rows.splice(y, 1);
      while (this.rows.length < TOP) this.rows.push(Array(W).fill(null));
    }
    const perfect = n > 0 && this.rows.every((row) => row.every((c) => c === null));
    if (perfect) {
      points += CLEAR_POINTS[n];
      label = `${label} · perfect clear`;
    }
    this.score += Math.round(points * this.level);
    if (n) {
      this.meter = Math.min(1, this.meter + n / ZONE_LINES);
      this.addLines(n);
      this.emit("clear", { rows: cleared, lines: n, spin, label, combo: this.combo, b2b: hard && label.startsWith("back"), perfect });
    } else if (spin) {
      this.emit("spin", { spin, label });
    }
    this.spawn();
  }

  addLines(n) {
    const before = this.level;
    this.lines += n;
    this.level = 1 + Math.floor(this.lines / 10);
    if (this.level !== before) this.emit("level", { level: this.level });
  }

  // ---- the Zone ----

  startZone() {
    if (this.zone || this.meter < 0.25) return;
    this.zone = this.meter * ZONE_SECONDS;
    this.meter = 0;
    this.zoneLines = 0;
    this.emit("zone", { seconds: this.zone });
  }

  endZone() {
    const n = this.zoneLines;
    const rows = this.rows.slice(0, n).map((cells, y) => ({ y, cells }));
    this.rows.splice(0, n);
    while (this.rows.length < TOP) this.rows.push(Array(W).fill(null));
    this.zone = 0;
    this.zoneLines = 0;
    // scored as one clear: n lines at once is worth n squared times fifty (four of them, a quad)
    const points = 50 * n * n * this.level;
    this.score += points;
    if (n) this.addLines(n);
    this.emit("zoneEnd", { lines: n, rows, points });
  }
}
