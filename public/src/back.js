// The way back. Once you have gone somewhere (through a portal, into a tag's room, out of one, or across
// the map in one jump), a small portal floats along beside you, ahead and a little low to the left, and
// takes you back to where you were before: the dimension, the room in it, and where you were a few
// seconds before you went (not already in the pull of what took you), facing as you faced. Taken, it
// takes you a step further back the next time, as far as it remembers.
//
// It follows lazily, and waits where it is while you look at it or come near, so it can be flown into
// (or clicked, as the portals round the clock are: see main.js). Its name under the crosshair says
// where it goes.
import * as THREE from "three";
import { voidHole } from "./hole.js";

export const BACK_HOLE = 24;          // the dark that fills it (the crosshair on this is on it)
const RING = 30;                      // smaller than the portals round the clock: a way of your own
const KEEP = 20;                      // how many places back it remembers
const BEFORE = 2.5;                   // seconds before a jump: where you were then
const FAR = 2500;                     // moved this far in one frame: a jump (the map)
const SPOT = new THREE.Vector3(-190, -70, -400); // where it floats, from you: ahead, a little low and to the left
const ahead = new THREE.Vector3(), to = new THREE.Vector3(), spot = new THREE.Vector3(), yawOnly = new THREE.Euler(0, 0, 0, "YXZ");

export class Back {
  // name(realm, room): what a place is called, for the name under the crosshair
  constructor({ scene, world, name }) {
    Object.assign(this, { world, name });
    this.places = [];
    this.recent = []; // where you have been these last seconds: { t, position, yaw, pitch }
    this.time = 0;
    this.here = null;
    this.returning = false;
    this.shown = 0;   // 0 to 1: it comes and goes softly
    this.position = new THREE.Vector3(); // (the flight into it follows this: see flyIntoPortal)
    this.gate = new THREE.Group();
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(RING, 1.6, 6, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fd8ff).multiplyScalar(0.62), transparent: true }));
    this.hole = new THREE.Mesh(new THREE.SphereGeometry(BACK_HOLE, 32, 18), voidHole(world.G.uTime));
    this.gate.add(this.ring, this.hole);
    this.gate.visible = false;
    scene.add(this.gate);
  }

  // where you are: the dimension, and the room of the viewer that dimension is (see the f0ck plugin)
  where() {
    const realm = this.world.realm, viewer = (window.cvoid?.viewers ?? []).find((v) => v.realm === realm) ?? null, room = viewer?.room ?? null;
    return { key: `${realm}|${room?.key ?? ""}`, realm, viewer, room };
  }

  // the place it goes to, if any
  get next() { return this.places.at(-1) ?? null; }
  get label() { return this.next ? `back to ${this.next.name}` : ""; }
  get open() { return this.shown > 0.5; }

  // taken: the place it goes to, no longer kept (and the jump there is not itself a place to go back to)
  take() {
    const place = this.places.pop() ?? null;
    if (place) this.returning = true;
    return place;
  }

  // Each frame (flying): a jump noticed, and the portal floated along. True when you have flown into it.
  update(dt, camera, started) {
    this.time += dt;
    const here = this.where(), last = this.recent.at(-1);
    const jumped = this.here && (here.key !== this.here.key || (last && last.position.distanceTo(camera.position) > FAR));
    if (jumped) {
      if (this.returning) this.returning = false;
      else if (started && last) {
        // where you were BEFORE seconds ago (or as long ago as is known)
        const then = this.recent.findLast((r) => r.t <= this.time - BEFORE) ?? this.recent[0];
        this.places.push({ realm: this.here.realm, viewer: this.here.viewer, room: this.here.room, name: this.name(this.here.realm, this.here.room), position: then.position, yaw: then.yaw, pitch: then.pitch });
        if (this.places.length > KEEP) this.places.shift();
        this.place(camera, true);
      }
      this.recent = [];
    }
    this.here = here;
    if (!this.recent.length || this.time - this.recent.at(-1).t > 0.2) {
      this.recent.push({ t: this.time, position: camera.position.clone(), yaw: camera.rotation.y, pitch: camera.rotation.x });
      if (this.recent.length > 40) this.recent.shift();
    }

    const want = started && this.places.length ? 1 : 0;
    this.shown += (want - this.shown) * Math.min(1, dt * 2.5);
    this.gate.visible = this.shown > 0.01;
    if (!this.gate.visible) return false;
    // it floats towards its place beside you, unhurried; looked at, or come near, it waits
    to.copy(this.position).sub(camera.position);
    const distance = to.length() || 1;
    const looking = THREE.MathUtils.smoothstep(camera.getWorldDirection(ahead).dot(to.divideScalar(distance)), 0.9, 0.985);
    const follow = (1 - looking) * THREE.MathUtils.smoothstep(distance, 160, 420);
    this.place(camera, false, dt * (distance > 3000 ? 6 : 1.4) * follow);
    this.gate.scale.setScalar(0.2 + 0.8 * this.shown);
    this.gate.lookAt(camera.position);
    this.ring.rotation.z += dt * 0.6;
    this.ring.material.opacity = this.shown;
    return this.shown > 0.9 && this.position.distanceTo(camera.position) < BACK_HOLE * 0.8;
  }

  // its place beside you (turned as you are, but not tipped as you look up or down), at once or easing
  place(camera, now, rate = 0) {
    yawOnly.set(0, camera.rotation.y, 0);
    spot.copy(SPOT).applyEuler(yawOnly).add(camera.position);
    if (now) this.position.copy(spot);
    else this.position.lerp(spot, 1 - Math.exp(-rate));
    this.gate.position.copy(this.position);
  }
}
