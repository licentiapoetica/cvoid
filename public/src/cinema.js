// The idle camera: left alone long enough in the void (nothing looked round, no key, no button), the
// view leaves you, as GTA IV's does, for shots of where you are from outside: Irrlicht beside you, the
// places and portals round it, cut from one to the next every few seconds. A slow arc round it, a low
// angle pushing in, high and wide, a drift past, a long lens from far off, over its shoulder to what is
// near. The first look round, key or button cuts straight back (and is only that: see main.js).
// In a plugin's dimension, what it gives to be shot (its cinema(): see main.js), as large as it is, and,
// if it turns to you (a card), only from before it.
// Only how the frame is drawn moves: where you are, and what you aim at, stay yours (each frame the
// camera is put at the shot for the picture, and given back after it: see shoot and restore).
import * as THREE from "three";

export const CINEMA_AFTER = 30; // seconds still before it starts
const SHOT = [5.5, 9];          // seconds a shot lasts
const KINDS = ["orbit", "low", "high", "track", "long", "shoulder"];
const SIGHT_NEAR = 6000;        // a portal (or the like) this near is what "shoulder" looks past Irrlicht to

const rand = (a, b) => a + Math.random() * (b - a);
const UP = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3(), look = new THREE.Vector3();

export class Cinema {
  // surround(camera): the sky and the dust put round the camera drawn from (see World.surround)
  constructor({ surround = () => {} } = {}) {
    this.surround = surround;
    this.on = false;
    this.shot = null;
    this.star = new THREE.Vector3(); // Irrlicht, where it is now
    this.you = new THREE.Vector3();  // and you
    this.saved = { at: new THREE.Vector3(), q: new THREE.Quaternion(), fov: 50 };
  }

  // each frame: what there is to shoot (none: it stops, or does not start), and where you are.
  // subject: { star, size (1: Irrlicht's), facing (it turns to you: shot only from before it), sights }
  update(dt, subject, you) {
    if (!subject) return void this.cut();
    this.star.copy(subject.star);
    this.you.copy(you);
    this.sights = subject.sights ?? [];
    this.size = subject.size ?? 1;
    this.facing = !!subject.facing;
    if (!this.on) this.on = true;
    if (!this.shot || (this.shot.t += dt) >= this.shot.length) this.shot = this.next(this.shot?.kind);
  }
  cut() {
    this.on = false;
    this.shot = null;
  }

  // the next shot: never the same kind twice running; from round it, as you and it stand now
  next(was) {
    const kinds = KINDS.filter((k) => k !== was && !(this.facing && k === "shoulder")); // (past what turns to you: its back)
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    // (along the way from you to it, level, and across that)
    const along = tmp.copy(this.star).sub(this.you).setY(0);
    if (along.lengthSq() < 1) along.set(1, 0, 0);
    along.normalize();
    const shot = { kind, t: 0, length: rand(...SHOT), along: along.clone(), across: along.clone().cross(UP), roll: Math.random() < 0.3 ? rand(-0.07, 0.07) : 0, phase: rand(0, 100) };
    // which way from it the shot is: anywhere round it; or, facing you, no more than ~60 degrees off before it
    const toYou = Math.atan2(-along.z, -along.x), angle = this.facing ? toYou + rand(-1.05, 1.05) : rand(0, Math.PI * 2);
    const around = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)), z = this.size;
    if (kind === "orbit") Object.assign(shot, { angle, radius: rand(170, 240) * z, high: rand(-40, 70) * z, spin: (this.facing && Math.abs(angle - toYou) > 0.3 ? -Math.sign(angle - toYou) : Math.random() < 0.5 ? -1 : 1) * rand(0.06, 0.1), fov: 42 }); // (facing you: arcing round towards before it)
    else if (kind === "low") Object.assign(shot, { from: around.clone().multiplyScalar(rand(260, 320) * z).setY(-rand(110, 150) * z), fov: 38 });
    else if (kind === "high") Object.assign(shot, { from: around.clone().multiplyScalar(rand(500, 700) * z).setY(rand(380, 520) * z * (this.facing ? 0.45 : 1)), drift: rand(-14, 14) * z, fov: 50 }); // (a flat thing facing you: not so high, or it is seen edge on)
    else if (kind === "track") Object.assign(shot, { from: around.clone().multiplyScalar(rand(300, 380) * z).setY(rand(-20, 40) * z), past: around.clone().cross(UP), speed: (Math.random() < 0.5 ? -1 : 1) * 22 * z, fov: 40 });
    else if (kind === "long") Object.assign(shot, { from: around.clone().multiplyScalar(rand(1100, 1500) * z).setY(rand(60, 200) * z), fov: 13 });
    else {
      // over its shoulder: past it, to the nearest thing worth seeing (a portal), or back to you
      const sight = this.sights.filter((at) => at.distanceTo(this.star) < SIGHT_NEAR).sort((a, b) => a.distanceTo(this.star) - b.distanceTo(this.star))[0];
      Object.assign(shot, { to: (sight ?? this.you).clone(), side: (Math.random() < 0.5 ? -1 : 1) * 55, fov: 50 });
    }
    return shot;
  }

  // the camera put at the shot, for the picture (given back by restore); Irrlicht turned to it
  shoot(camera, back) {
    const s = this.shot;
    if (!this.on || !s) return false;
    const { at, q } = this.saved;
    at.copy(camera.position);
    q.copy(camera.quaternion);
    this.saved.fov = camera.fov;
    const k = s.t / s.length, ease = k * k * (3 - 2 * k), star = this.star;
    look.copy(star);
    if (s.kind === "orbit") {
      const a = s.angle + s.spin * s.t;
      camera.position.set(Math.cos(a) * s.radius, s.high, Math.sin(a) * s.radius).add(star);
    } else if (s.kind === "low") {
      camera.position.copy(s.from).multiplyScalar(1 - 0.3 * ease).add(star); // (pushing in)
      look.y += 15;
    } else if (s.kind === "high") {
      camera.position.copy(s.from).addScaledVector(s.across, s.drift * s.t).add(star);
      look.lerp(this.you, 0.3);
    } else if (s.kind === "track") {
      camera.position.copy(s.from).addScaledVector(s.past, s.speed * (s.t - s.length / 2)).add(star); // (sliding past it)
    } else if (s.kind === "long") {
      camera.position.copy(s.from).setLength(Math.min(s.from.length(), camera.far * 0.6)).add(star); // (within the view's reach)
      look.addScaledVector(s.across, 30 * this.size * (k - 0.5)); // (a slow pan across it)
    } else {
      const away = tmp.copy(star).sub(s.to).normalize();
      camera.position.copy(star).addScaledVector(away, (150 - 30 * ease) * this.size).addScaledVector(s.across, s.side * this.size).add(look.set(0, 45 * this.size, 0));
      look.copy(star).lerp(s.to, 0.5);
    }
    // held by hand: never quite still
    const t = s.t + s.phase, hand = camera.position.distanceTo(look) * 0.004;
    look.add(tmp.set(Math.sin(t * 0.7) * hand, Math.sin(t * 0.53 + 1) * hand, Math.cos(t * 0.61) * hand));
    camera.up.copy(UP);
    camera.lookAt(look);
    if (s.roll) camera.rotateZ(s.roll);
    if (camera.fov !== s.fov) { camera.fov = s.fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    back.viewFrom(camera);
    this.surround(camera); // (the void all round the shot, not round you off in it)
    return true;
  }
  restore(camera, back) {
    camera.position.copy(this.saved.at);
    camera.quaternion.copy(this.saved.q);
    if (camera.fov !== this.saved.fov) { camera.fov = this.saved.fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    back.viewFrom(camera);
    this.surround(camera);
  }
}
