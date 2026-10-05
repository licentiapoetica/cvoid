// J: a gob of something not of this world, shot at the post you are looking at (any post: f0ck's, and
// the dimensions built on it). It flies wobbling, lands with a splat, silently, and clings to the screen: a
// glistening jelly, almost clear, faintly green where it is thick, catching the light, that jiggles a
// while and slowly runs down the screen in a few drips, each with a bead at its end, as far as the
// bottom edge. After a while it dries away. Missing every post, it arcs off and is gone.
//
// It clings to the screen, not to the place: a post drifting, or opened wide, takes its goo along.
//
// Never the same amount twice: mostly a fair gob, now and then a great one, coming out in two or three
// spurts. It comes from a store that runs low: four or five shots empty it, the last ones less and less,
// and then nothing comes until it has gathered again, slowly, after a rest.
import * as THREE from "three";

const SPEED = 2200;        // the gob's flight, units a second
const REACH = 9000;        // as far as it can be shot at a post
const STAYS = 32, DRIES = 7; // seconds it clings, then dries away
const MOST = 24;           // splats at once (the oldest goes first)
const SIZE = 0.3;          // a splat's width, against its post's
const OFF = 0.8;           // how far in front of the screen it lies (it is on it, not in it)
const COST = 0.27;         // of a full store, what a fair shot (amount 1) takes
const REFILL = 40, REST = 2.5; // seconds to gather a full store again, once it has rested this long

const JELLY = /* glsl */ `
// the goo itself, in the splat's own units: a lobed blob, droplets round it, drips running down
uniform float uTime, uAge, uR, uShow, uDripMax;
uniform vec4 uLobes;                   // phases of its edge's lobes, and a seed
uniform vec4 uDrops[8];                // the droplets: x, y, radius, -
uniform vec4 uDrips[4];                // the drips: x, how far at most, how wide, how slow
uniform int uDropN, uDripN;            // how many of each (more goo, more of them)
varying vec2 vP;
float smin(float a, float b, float k) { float h = clamp(.5 + .5 * (b - a) / k, 0., 1.); return mix(b, a, h) - k * h * (1. - h); }
float seg(vec2 p, vec2 a, vec2 b, float r) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h) - r; }
float goo(vec2 p) {
  float t = uTime, age = uAge;
  // it lands with a pop, and goes on jiggling, less and less
  float pop = 1. - exp(-age * 14.) * cos(age * 22.);
  float jiggle = exp(-age * 1.2) * .1 * sin(age * 17.) + .025 * sin(t * 3.1 + uLobes.w * 6.);
  float r = uR * (.4 + .6 * pop) * (1. + jiggle);
  float a = atan(p.y, p.x);
  float edge = r * (1. + .13 * sin(3. * a + uLobes.x) + .08 * sin(5. * a + uLobes.y) + .05 * sin(9. * a + uLobes.z + t * .7));
  float d = length(p * vec2(1. - jiggle * .5, 1. + jiggle * .5)) - edge;
  for (int i = 0; i < 8; i++) if (i < uDropN) d = smin(d, length(p - uDrops[i].xy * pop) - uDrops[i].z * (1. + jiggle), uR * .12);
  // drips: they gather, run, and slow, beads at their ends; none further than the screen goes
  for (int i = 0; i < 4; i++) {
    if (i >= uDripN) break;
    vec4 q = uDrips[i];
    float run = min(q.y * (1. - exp(-max(age - .4, 0.) / q.w)), uDripMax);
    vec2 from = vec2(q.x, -uR * .5), to = vec2(q.x + .08 * uR * sin(run / uR * 2.3 + q.w), -uR * .5 - run);
    float w = q.z * (1. + .15 * sin(t * 4. + q.w * 3.));
    d = smin(d, seg(p, from, to, w * .6), uR * .18);
    d = smin(d, length(p - to) - w * (1. + .5 * smoothstep(0., uR, run)), uR * .1);
  }
  return d;
}
void main() {
  float d = goo(vP);
  float h = clamp(-d / (uR * .32), 0., 1.);    // how thick: a dome, thin at its edge
  if (h <= 0.) discard;
  float dome = sqrt(h);
  // its surface, for the light on it: rounding off towards its edges, as a bead of jelly does
  float e = uR * .04;
  vec2 grad = vec2(goo(vP + vec2(e, 0.)) - goo(vP - vec2(e, 0.)), goo(vP + vec2(0., e)) - goo(vP - vec2(0., e))) / (2. * e);
  vec3 n = normalize(vec3(grad * .9 * (1. - smoothstep(.3, .85, h)) / max(dome * 2.2, .25), 1.)); // (its thick middle lies flat)
  vec3 l = normalize(vec3(-.45, .65, .6)), v = vec3(0., 0., 1.);
  float spec = pow(max(dot(reflect(-l, n), v), 0.), 48.) + .35 * pow(max(dot(reflect(-normalize(vec3(.5, -.2, .8)), n), v), 0.), 18.);
  float rim = smoothstep(0., .12, h) * (1. - smoothstep(.12, .45, h)); // its meniscus, where it thins out
  float fresnel = pow(1. - n.z, 2.);
  vec3 tint = mix(vec3(.78, 1., .86), vec3(.5, .95, .62), dome);       // clear, greening where it is thick
  vec3 c = tint * (.35 + .4 * dome) + vec3(.7, 1., .9) * fresnel * .6 + vec3(1.) * spec;
  float alpha = (.05 + .13 * dome + .22 * rim + .45 * fresnel) * smoothstep(0., .04, h) + spec * .9; // (almost clear: the screen shows through)
  gl_FragColor = vec4(c, clamp(alpha, 0., .95) * uShow);
}`;
const JELLY_VERT = /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;

// the gob in flight: a wobbling bead of the same jelly
const GOB_VERT = /* glsl */ `varying vec3 vN, vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
const GOB_FRAG = /* glsl */ `uniform float uShow; varying vec3 vN, vV;
void main(){
  vec3 n = normalize(vN), v = normalize(vV);
  float fresnel = pow(1. - max(dot(n, v), 0.), 2.5);
  float spec = pow(max(dot(reflect(-normalize(vec3(-.4, .7, .6)), n), v), 0.), 40.);
  gl_FragColor = vec4(vec3(.62, 1., .74) * (.3 + .7 * fresnel) + spec, (.22 + .6 * fresnel + spec) * uShow);
}`;

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const ray = new THREE.Raycaster(), CENTRE = new THREE.Vector2();
const tmp = new THREE.Vector3(), normal = new THREE.Vector3(), xAxis = new THREE.Vector3(), yAxis = new THREE.Vector3(), basis = new THREE.Matrix4(), normals = new THREE.Matrix3();
const UP = new THREE.Vector3(0, 1, 0), GRAVITY = new THREE.Vector3(0, -900, 0);

export class Goo {
  // muzzle(camera): where shots leave from (see laser.js); storeEl: the bar showing what is left (index.html)
  constructor({ scene, world, muzzle, storeEl }) {
    Object.assign(this, { scene, world, muzzle, storeEl });
    this.gobs = [];   // in flight
    this.splats = []; // clinging
    this.gobGeometry = new THREE.IcosahedronGeometry(7, 3);
    this.store = 1;   // 0 to 1: what there is to shoot
    this.rested = 0;  // seconds since the last shot
    this.fullFor = Infinity; // seconds it has been full (the bar shown a moment more, then gone)
    // the bar's notches: one for each fair shot in a full store
    for (let x = COST; x < 0.999; x += COST) {
      const notch = Object.assign(document.createElement("div"), { className: "notch" });
      notch.style.left = `${x * 100}%`;
      storeEl?.append(notch);
    }
  }

  // the bar: shown while the store is used and gathers again, a moment after it is full, glowing then
  showStore(dt) {
    const el = this.storeEl;
    if (!el) return;
    this.fullFor = this.store >= 1 ? this.fullFor + dt : 0;
    const width = `${(this.store * 100).toFixed(1)}%`, fill = el.firstElementChild;
    if (fill.style.width !== width) fill.style.width = width;
    el.classList.toggle("show", this.fullFor < 1.6);
    el.classList.toggle("full", this.store >= 1 && this.fullFor < 1.6);
    el.classList.toggle("low", this.store < COST); // (less than a fair shot left)
  }

  // Shot from you at what the crosshair is on: a post's screen, if any is. How much comes: never the
  // same, now and then a great deal, and less as the store runs low. Its amount (1 a fair one), or 0:
  // nothing left.
  shoot(camera) {
    if (this.store < 0.04) return 0;
    let amount = rand(0.5, 1.25) * (Math.random() < 0.2 ? rand(1.5, 1.9) : 1);
    amount = Math.min(amount * (0.7 + 0.3 * this.store), this.store / COST); // (running low: less, the last of it all there is)
    this.store = Math.max(0, this.store - amount * COST);
    this.rested = 0;
    const panels = [];
    this.scene.traverseVisible((o) => { if (o.isMesh && o.userData.panel) panels.push(o); });
    ray.setFromCamera(CENTRE, camera);
    ray.far = REACH;
    const hit = ray.intersectObjects(panels, false)[0] ?? null;
    let target = null;
    if (hit) {
      // where on the post, in its own (unscaled) terms, so the goo stays put as the post drifts or is opened wide
      // (and which side of the screen it is shot at: its goo lies on that one)
      normals.getNormalMatrix(hit.object.matrixWorld);
      const side = normal.copy(hit.face.normal).applyMatrix3(normals).dot(tmp.copy(camera.position).sub(hit.point)) > 0 ? 1 : -1;
      target = { mesh: hit.object, at: hit.object.worldToLocal(hit.point.clone()), normal: hit.face.normal.clone(), side };
    }
    // a great one comes in spurts, one after another, each landing a little off the first
    const spurts = amount > 1.6 ? 3 : amount > 1.15 ? 2 : 1;
    const shares = spurts === 1 ? [1] : spurts === 2 ? [0.7, 0.3] : [0.55, 0.28, 0.17];
    let delay = 0;
    shares.forEach((share, i) => {
      const gob = { amount: amount * share, delay, age: 0, spin: rand(0, 6), camera };
      if (target) {
        gob.target = i === 0 ? target : { ...target, at: target.at.clone().add(tmp.set(rand(-0.06, 0.06), rand(-0.06, 0.03), 0)) };
        gob.target.at.x = THREE.MathUtils.clamp(gob.target.at.x, -0.47, 0.47);
        gob.target.at.y = THREE.MathUtils.clamp(gob.target.at.y, -0.45, 0.47);
        gob.flight = Math.max(0.08, hit.distance / SPEED);
      }
      this.gobs.push(gob);
      delay += rand(0.08, 0.15);
    });
    return amount;
  }

  // a gob leaving you: from where shots leave, now
  launch(gob) {
    const camera = gob.camera;
    gob.mesh = new THREE.Mesh(this.gobGeometry, new THREE.ShaderMaterial({
      uniforms: { uShow: { value: 1 } }, vertexShader: GOB_VERT, fragmentShader: GOB_FRAG, transparent: true, depthWrite: false,
    }));
    gob.size = 0.45 + 0.6 * Math.sqrt(gob.amount);
    gob.from = this.muzzle(camera).clone();
    gob.mesh.position.copy(gob.from);
    this.scene.add(gob.mesh);
    if (!gob.target) gob.velocity = camera.getWorldDirection(tmp).multiplyScalar(SPEED * 0.8).clone();
  }

  update(dt, camera) {
    // the store gathers again, after a rest
    this.rested += dt;
    if (this.rested > REST) this.store = Math.min(1, this.store + dt / REFILL);
    this.showStore(dt);
    for (const gob of [...this.gobs]) {
      if ((gob.delay -= dt) > 0) continue; // (a spurt still to come)
      if (!gob.mesh) this.launch(gob);
      gob.age += dt;
      const m = gob.mesh, k = gob.size;
      // it wobbles as it goes
      m.scale.set(k * (1 + 0.25 * Math.sin(gob.age * 31 + gob.spin)), k * (1 + 0.25 * Math.sin(gob.age * 27 + 2)), k * (1 + 0.25 * Math.sin(gob.age * 23 + 4)));
      m.rotation.y += dt * 5;
      if (gob.target) {
        // (to where that place on the post is now, in a slight arc)
        const t = Math.min(1, gob.age / gob.flight), to = this.onPost(gob.target, tmp);
        if (!to) { this.drop(gob); continue; } // (its post gone on the way)
        const arc = Math.sin(Math.PI * t) * gob.from.distanceTo(to) * 0.06;
        m.position.copy(gob.from).lerp(to, t).y += arc;
        if (t >= 1) { this.splat(gob.target, gob.amount); this.drop(gob); }
      } else {
        gob.velocity.addScaledVector(GRAVITY, dt);
        m.position.addScaledVector(gob.velocity, dt);
        m.material.uniforms.uShow.value = 1 - THREE.MathUtils.smoothstep(gob.age, 0.8, 1.4);
        if (gob.age > 1.4) this.drop(gob);
      }
    }
    for (const s of [...this.splats]) {
      s.age += dt;
      const gone = !s.target.mesh.parent || !s.mesh.parent;
      if (gone || s.age > STAYS + DRIES) { this.unstick(s); continue; }
      this.place(s);
      const u = s.mesh.material.uniforms;
      u.uAge.value = s.age;
      // drying, and as its post fades, so does it
      u.uShow.value = (1 - THREE.MathUtils.smoothstep(s.age, STAYS, STAYS + DRIES)) * (s.target.mesh.material.uniforms?.uShow?.value ?? 1);
    }
  }

  // where a point on a post is now, in the world (null if the post is gone)
  onPost(target, out) {
    if (!target.mesh.parent) return null;
    return target.mesh.localToWorld(out.copy(target.at));
  }

  // the gob arrived: the goo spread on the screen there, on the side it was shot at, as much as it was
  // (more: wider, more droplets flung round it, more drips and further down)
  splat(target, amount = 1) {
    const post = target.mesh, group = post.parent;
    const width = post.scale.x * SIZE * THREE.MathUtils.clamp(0.45 + 0.55 * amount, 0.3, 1.5), r = width * 0.3;
    // how far it may run: down to the screen's bottom edge (the post's own -0.5), from where it landed
    const dripMax = Math.max(0, (target.at.y + 0.5) * post.scale.y - r * 0.9);
    const top = r * 2, bottom = -(r * 0.6 + dripMax + r * 0.4);
    const geometry = new THREE.PlaneGeometry(width * 1.8, top - bottom, 1, 1).translate(0, (top + bottom) / 2, 0);
    const lobes = new THREE.Vector4(rand(0, 6), rand(0, 6), rand(0, 6), Math.random());
    const dropN = THREE.MathUtils.clamp(Math.round(amount * 3.2 + rand(-1, 1)), 0, 8), dripN = THREE.MathUtils.clamp(Math.round(amount * 2.4 + rand(-0.6, 0.6)), 1, 4);
    const reach = THREE.MathUtils.clamp(0.25 + 0.6 * amount, 0.15, 1); // (how far down its longest drip goes, of the way to the edge)
    const drops = Array.from({ length: 8 }, () => {
      const a = rand(0, Math.PI * 2), d = rand(1.25, 2.1) * r;
      return new THREE.Vector4(Math.cos(a) * d, Math.sin(a) * d * 0.8 + r * 0.15, rand(0.08, 0.22) * r, 0);
    });
    const drips = Array.from({ length: 4 }, (_, i) => new THREE.Vector4(
      rand(-0.75, 0.75) * r, dripMax * reach * (i === 0 ? rand(0.75, 1) : rand(0.2, 0.85)), rand(0.1, 0.2) * r, rand(2.5, 7),
    ));
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: this.world.G.uTime, uAge: { value: 0 }, uR: { value: r }, uShow: { value: 1 }, uDripMax: { value: dripMax },
        uLobes: { value: lobes }, uDrops: { value: drops }, uDrips: { value: drips }, uDropN: { value: dropN }, uDripN: { value: dripN },
      },
      vertexShader: JELLY_VERT, fragmentShader: JELLY, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = (post.renderOrder ?? 0) + 1;
    const s = { mesh, target, age: 0, scale0: post.scale.x };
    group.add(mesh);
    this.place(s);
    this.splats.push(s);
    while (this.splats.length > MOST) this.unstick(this.splats[0]);
  }

  // the splat laid on its screen as the post is now: where it landed, lying along the screen there, its
  // drips running down the screen (the post's own down, however it is tilted), as large as the post is
  place(s) {
    const post = s.target.mesh, m = s.mesh;
    m.position.copy(s.target.at).applyMatrix4(post.matrix);
    normals.getNormalMatrix(post.matrix);
    normal.copy(s.target.normal).applyMatrix3(normals).normalize().multiplyScalar(s.target.side);
    xAxis.crossVectors(UP, normal).normalize();
    yAxis.crossVectors(normal, xAxis);
    m.quaternion.setFromRotationMatrix(basis.makeBasis(xAxis, yAxis, normal));
    m.position.addScaledVector(normal, OFF);
    m.scale.setScalar(post.scale.x / s.scale0);
  }

  drop(gob) {
    gob.mesh?.removeFromParent();
    gob.mesh?.material.dispose();
    this.gobs.splice(this.gobs.indexOf(gob), 1);
  }

  unstick(s) {
    s.mesh.removeFromParent();
    s.mesh.geometry.dispose();
    s.mesh.material.dispose();
    this.splats.splice(this.splats.indexOf(s), 1);
  }
}
