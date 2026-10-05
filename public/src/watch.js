// A test: Irrlicht watching along on a tour (see back.js feel). While a tour holds you at a post (a video,
// a picture, a loop), it watches with you and shows how it takes it, moment to moment: from what is heard
// (a beat it grooves to, a sudden loudness that startles it, a long quiet that bores or saddens it) and,
// for a picture, slowly, as it looks it over. A new post: it leans in, eyes wide. Now and then, rarely,
// a word or two.
import * as THREE from "three";

// each face: lids (0 open, 1 shut), how wide, a smile (1: two arches), how much it looks at the post
// (1, the middle of the screen) rather than at you (0); and how its eyes move in it
const FACES = {
  rapt:      { lid: 0,    wide: 1.18, smile: 0,    at: 1 },
  delight:   { lid: 0,    wide: 1.1,  smile: 1,    at: 0.8 },
  giggle:    { lid: 0.1,  wide: 1,    smile: 1,    at: 0.5, shake: true },
  groove:    { lid: 0.12, wide: 1.05, smile: 0.55, at: 0.8, bounce: true },
  shock:     { lid: 0,    wide: 1.45, smile: 0,    at: 1 },
  skeptical: { lid: 0.4,  wide: 0.95, smile: 0,    at: 0 },   // (at you: are you seeing this?)
  puzzled:   { lid: 0.08, wide: 1.05, smile: 0,    at: 0.3, dart: true },
  sad:       { lid: 0.34, wide: 0.92, smile: 0,    at: 0.2, down: true },
  bored:     { lid: 0.55, wide: 0.95, smile: 0,    at: 0,   wander: true },
};
const WORDS = {
  rapt: ["ooh", "wait, look", "oh?"],
  delight: ["ha!", "oh i like this", "nice"],
  giggle: ["hehe", "pfff", "haha"],
  groove: ["♪", "yes yes yes", "this one!"],
  shock: ["whoa", "what", "oh no"],
  skeptical: ["hm.", "really?", "sure..."],
  puzzled: ["huh?", "what am i looking at", "?"],
  sad: ["oh...", "aw"],
  bored: ["next?", "mm.", "*yawn*"],
};
const SAY_GAP = 25; // seconds at least between its words
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export class Watching {
  constructor() {
    this.time = 0;
    this.id = undefined;  // the post it watches
    this.since = 0;       // since when
    this.face = "rapt";
    this.until = 0;       // till when this face holds
    this.avg = 0;         // how loud it has been, of late
    this.beats = [];      // beats heard these last seconds
    this.wasBeat = false;
    this.quiet = 0;       // how long it has been quiet
    this.shockAt = -99;
    this.saidAt = -99;
    this.look = new THREE.Vector2();
  }

  // Each frame while it watches: the post ({ id, text }), what is heard ({ bass, mid, high, beat }, 0 to 1)
  // and the way to the middle of the screen from it (where the post is). Its face, and words, if any.
  update(dt, item, heard, toPost) {
    this.time += dt;
    let say = null;
    const picture = /^image\b/.test(item.text ?? "");
    if (item.id !== this.id) {
      this.id = item.id;
      this.since = this.time;
      this.set("rapt", 2.2);
      this.beats = [];
      say = this.maybe(0.05);
    }
    const level = (heard.bass + heard.mid + heard.high) / 3;
    this.avg += (level - this.avg) * Math.min(1, dt * 0.5);
    const beat = heard.beat > 0.6;
    if (beat && !this.wasBeat) this.beats.push(this.time);
    this.wasBeat = beat;
    while (this.beats.length && this.beats[0] < this.time - 4) this.beats.shift();
    this.quiet = level < 0.12 ? this.quiet + dt : 0;
    if (!picture && level - this.avg > 0.3 && this.time - this.shockAt > 7) {
      // a sudden loudness: startled, at once
      this.shockAt = this.time;
      this.set("shock", 1.3);
      say = this.maybe(0.2);
    } else if (this.time > this.until) {
      this.set(this.choose(picture, heard), THREE.MathUtils.randFloat(picture ? 3.5 : 2.5, picture ? 7 : 5.5));
      say ??= this.maybe(0.08);
    }

    const f = FACES[this.face], t = this.time, look = this.look.copy(toPost).multiplyScalar(f.at);
    if (f.bounce) look.y += heard.beat * 0.03;
    if (f.shake) look.y += Math.sin(t * 22) * 0.008;
    if (f.dart) look.set(Math.sign(Math.sin(t * 2.3)) * 0.035, 0.01).addScaledVector(toPost, 0.3);
    if (f.down) look.y -= 0.03;
    if (f.wander) look.set(Math.sin(t * 0.5) * 0.05, Math.cos(t * 0.37) * 0.03);
    return { name: this.face, lid: f.lid, wide: f.wide, smile: f.smile, look, say };
  }

  set(face, seconds) {
    this.face = face;
    this.until = this.time + seconds;
  }

  // what it makes of it now: a beat grooved to, the bright and lively enjoyed, a long quiet a let down,
  // a long while at one post a bore; and always something of being taken with it, unsure, or doubtful
  choose(picture, heard) {
    const long = this.time - this.since;
    const grooving = this.beats.length >= 4;
    const weights = picture ? {
      rapt: 3, delight: 2, puzzled: 2, skeptical: 1.5, giggle: 1, sad: 0.5, bored: long > 20 ? 2 : 0.2,
    } : {
      groove: grooving ? 5 : 0, delight: 1.5 + heard.high * 2, giggle: 1 + heard.mid, rapt: 2, puzzled: 1, skeptical: 1,
      sad: this.quiet > 3 ? 1.5 : 0.3, bored: (this.quiet > 6 ? 2 : 0.2) + (long > 40 ? 1 : 0),
    };
    weights[this.face] = (weights[this.face] ?? 0) * 0.3; // (seldom the same twice)
    let r = Math.random() * Object.values(weights).reduce((a, b) => a + b, 0);
    for (const [face, w] of Object.entries(weights)) if ((r -= w) <= 0) return face;
    return "rapt";
  }

  // rarely, a word or two for how it takes it
  maybe(chance) {
    if (this.time - this.saidAt < SAY_GAP || Math.random() > chance) return null;
    this.saidAt = this.time;
    return pick(WORDS[this.face]);
  }
}
