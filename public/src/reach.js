// How far is seen. Zoomed in, further: the view's reach, and the portals' with it, eased out with the
// lens and back in after it (see main.js). A portal coming into that reach is not just there: it opens
// out from its middle, and one left behind as the reach draws back in closes into it.
// materialize(object, distance, dt): each portal's ring (the plugins' own, and the ones still forming),
// shown or not by it, each frame, in place of a plain distance; drawn(on): its scale while it opens or
// closes, put on just for the picture (and taken off after it, so no one else ever sees it).
import * as THREE from "three";
import { PORTAL_SEEN } from "./constants.js";

export const ZOOM_REACH = 2.2; // how much further, zoomed in all the way (from the hub, well across the circle)
const MATERIALIZE = 0.9;       // s, a portal opening out of nothing (or closing into it)

let reach = 1;
export const viewReach = () => reach;
// eased towards how far it should be (by main.js, each frame, as the lens is)
export function setViewReach(zoomed, dt) {
  reach += ((zoomed ? ZOOM_REACH : 1) - reach) * Math.min(1, dt * 4);
}

const presence = new WeakMap(); // object → 0..1, how far it has come into being
const between = new Set();      // those opening or closing now
// (one first seen within reach is simply there: what is new opens out by forming.js already)
export function materialize(object, distance, dt, near = PORTAL_SEEN) {
  const seen = distance < near * reach;
  const was = presence.get(object) ?? (seen ? 1 : 0), now = THREE.MathUtils.clamp(was + (seen ? dt : -dt) / MATERIALIZE, 0, 1);
  presence.set(object, now);
  if (now > 0 && now < 1) between.add(object);
  else between.delete(object);
  object.visible = now > 0;
  return object.visible;
}

const eased = (t) => 1 - (1 - t) ** 3; // (quick, then settling)
const kept = new Map(); // object → its own scale, while the picture is drawn
let keptFar = 0;
// on, just before the picture: the view's reach widened, those opening or closing at their size; off, just
// after it: both as they were
export function drawn(camera, on) {
  if (on) {
    keptFar = camera.far;
    camera.far *= reach;
    camera.updateProjectionMatrix();
    for (const object of between) {
      if (!object.parent) { between.delete(object); continue; } // (taken away by its plugin)
      if (!object.visible) continue;
      kept.set(object, object.scale.clone());
      object.scale.multiplyScalar(Math.max(0.001, eased(presence.get(object))));
    }
  } else {
    camera.far = keptFar;
    camera.updateProjectionMatrix();
    for (const [object, scale] of kept) object.scale.copy(scale);
    kept.clear();
  }
}
