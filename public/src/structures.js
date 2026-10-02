// What a sector is built from: a few primitive solids, arranged by layout generators.
// A sector stacks up to three layers, each its own layout, solid, stretch and symmetry.
import * as THREE from "three";
import { makeField, mulberry32 } from "./noise.js";
import { CELL, REACH } from "./constants.js";

const MAX_PER_LAYER = 1500;
const dummy = new THREE.Object3D();
const Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

// Faceted solids carry barycentric coordinates so the shader can light their edges.
// Edges between two triangles of the same flat face are hidden, so a quad reads as a quad.
function faceted(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.computeVertexNormals();
  const pos = g.attributes.position, count = pos.count, bary = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) bary[i * 3 + (i % 3)] = 1;
  const corner = (i) => `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const edges = new Map();
  for (let t = 0; t < count / 3; t++) {
    a.fromBufferAttribute(pos, t * 3); b.fromBufferAttribute(pos, t * 3 + 1); c.fromBufferAttribute(pos, t * 3 + 2);
    const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    for (let e = 0; e < 3; e++) {
      const key = [corner(t * 3 + e), corner(t * 3 + ((e + 1) % 3))].sort().join("|");
      const other = edges.get(key);
      if (!other) edges.set(key, { t, e, normal });
      else if (other.normal.dot(normal) > 0.999) {
        // the edge opposite a vertex is where that vertex's coordinate reaches 0; pin it to 1 to hide it
        for (const hit of [other, { t, e }]) for (let k = 0; k < 3; k++) bary[(hit.t * 3 + k) * 3 + ((hit.e + 2) % 3)] = 1;
      }
    }
  }
  g.setAttribute("aBary", new THREE.BufferAttribute(bary, 3));
  return g;
}

// a roof: a triangular prism with its ridge along z
function wedge() {
  const A = [-0.5, -0.5, 0.5], B = [0.5, -0.5, 0.5], C = [0, 0.5, 0.5];
  const A2 = [-0.5, -0.5, -0.5], B2 = [0.5, -0.5, -0.5], C2 = [0, 0.5, -0.5];
  const tris = [A, B, C, B2, A2, C2, B, B2, C2, B, C2, C, A, C, C2, A, C2, A2, A, A2, B2, A, B2, B];
  return new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(tris.flat()), 3));
}

export const PRIMITIVES = {
  cube: new THREE.BoxGeometry(1, 1, 1),
  tetra: faceted(new THREE.TetrahedronGeometry(0.75)),
  octa: faceted(new THREE.OctahedronGeometry(0.7)),
  icosa: faceted(new THREE.IcosahedronGeometry(0.62)),
  torus: faceted(new THREE.TorusGeometry(0.5, 0.14, 5, 12)),
  wedge: faceted(wedge()),
  cyl: faceted(new THREE.CylinderGeometry(0.5, 0.5, 1, 10)),
  cone: faceted(new THREE.ConeGeometry(0.5, 1, 10)),
  pyramid: faceted(new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1, false, Math.PI / 4)),
  sphere: faceted(new THREE.IcosahedronGeometry(0.5, 1)),
};

// orient: nothing, an [x, y, z] euler, or { axis: "y" | "z", dir } to point that local axis along dir
function instance(list, x, y, z, sx, sy, sz, tint = 0, orient) {
  if (list.length >= list.cap) return;
  dummy.position.set(x, y, z);
  dummy.scale.set(sx, sy, sz);
  if (!orient) dummy.rotation.set(0, 0, 0);
  else if (Array.isArray(orient)) dummy.rotation.set(orient[0], orient[1], orient[2]);
  else dummy.quaternion.setFromUnitVectors(orient.axis === "y" ? Y : Z, orient.dir);
  dummy.updateMatrix();
  list.push({ matrix: dummy.matrix.clone(), tint });
}

const v = new THREE.Vector3(), dir = new THREE.Vector3(), grad = new THREE.Vector3();
const unit = (r, out) => out.set(r() - 0.5, r() - 0.5, r() - 0.5).normalize();

const GENERATORS = {
  towers(st, field, r, out) {
    const n = 8 + Math.round(st.density * 12);
    const step = (REACH * 2) / n;
    const width = step * (0.35 + 0.3 * Math.min(st.scale, 1.6) / 1.6);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const jitter = (1 - st.order) * step * 0.45;
      const x = -REACH + (i + 0.5) * step + (r() - 0.5) * jitter;
      const z = -REACH + (j + 0.5) * step + (r() - 0.5) * jitter;
      const h = field(x / CELL, 0, z / CELL);
      if (h < 0.3 * (1 - st.density)) continue;
      const height = width * Math.max(1, Math.round((h ** 1.6) * 22 * st.scale));
      instance(out, x, -REACH + height / 2, z, width, height, width, h > 0.72 ? 1 : 0, [0, st.twist * h * 1.5, 0]);
    }
  },
  monoliths(st, field, r, out) {
    const count = 5 + Math.round(st.density * 26);
    for (let i = 0; i < count; i++) {
      const x = (r() - 0.5) * REACH * 1.8, z = (r() - 0.5) * REACH * 1.8, y = (r() - 0.5) * REACH;
      const h = (140 + field(x / CELL, y / CELL, z / CELL) * 300) * Math.min(st.scale, 1.5);
      const yaw = st.order > 0.7 ? 0 : r() * Math.PI;
      const tilt = (r() - 0.5) * st.twist * 1.4;
      instance(out, x, y, z, (30 + r() * 60) * st.scale, h, (6 + r() * 14) * st.scale, r() < 0.15 ? 1 : 0, [tilt, yaw, tilt * 0.5]);
    }
  },
  lattice(st, field, r, out) {
    const n = 9 + Math.round(st.density * 4);
    const step = (REACH * 2) / n;
    const threshold = 0.72 - st.density * 0.3;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
      const x = -REACH + (i + 0.5) * step, y = -REACH + (j + 0.5) * step, z = -REACH + (k + 0.5) * step;
      const h = field(x / CELL, y / CELL, z / CELL);
      if (h < threshold) continue;
      const size = step * (0.25 + 0.3 * Math.min(st.scale, 2) / 2) * (st.order > 0.5 ? 1 : 0.5 + h);
      const wobble = (1 - st.order) * step * 0.4;
      instance(out, x + (r() - 0.5) * wobble, y + (r() - 0.5) * wobble, z + (r() - 0.5) * wobble, size, size, size,
        h > threshold + 0.15 ? 1 : 0, st.order > 0.6 ? null : [r() * st.twist * 3, r() * st.twist * 3, 0]);
    }
  },
  shards(st, field, r, out) {
    const count = 120 + Math.round(st.density * 700);
    const gauss = () => (r() + r() + r() - 1.5) / 1.5;
    for (let i = 0; i < count; i++) {
      const x = gauss() * REACH, y = gauss() * REACH, z = gauss() * REACH;
      const h = field(x / CELL, y / CELL, z / CELL);
      const len = (30 + h * 150) * st.scale, thick = (1.5 + r() * 3) * st.scale;
      // ordered shards point away from the centre; chaotic ones point anywhere
      if (r() < st.order) dir.set(x, y, z).normalize();
      else unit(r, dir);
      instance(out, x, y, z, thick, len, thick, h > 0.65 ? 1 : 0, { axis: "y", dir });
    }
  },
  rings(st, field, r, out) {
    const rings = 2 + Math.round(st.density * 6);
    const size = 9 * st.scale;
    for (let k = 0; k < rings; k++) {
      const radius = 50 + ((REACH - 60) * (k + 1)) / rings;
      const count = Math.max(6, Math.floor((Math.PI * 2 * radius) / (size * (2.2 + (1 - st.density) * 3))));
      const tiltX = st.twist * k * 0.5, tiltZ = st.twist * Math.sin(k * 1.7) * 0.6;
      const euler = new THREE.Euler(tiltX, 0, tiltZ);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + (1 - st.order) * (r() - 0.5);
        v.set(Math.cos(a) * radius, 0, Math.sin(a) * radius).applyEuler(euler);
        const s = size * (0.5 + field(v.x / CELL, v.y / CELL, v.z / CELL));
        instance(out, v.x, v.y, v.z, s, s, s, k % 3 === 2 ? 1 : 0, [tiltX, -a, tiltZ]);
      }
    }
  },
  spiral(st, field, r, out) {
    const count = 250 + Math.round(st.density * 900);
    const arms = 1 + Math.round(st.twist * 2);
    const turns = 3 + st.twist * 8;
    for (let i = 0; i < count; i++) {
      const t = i / count;
      const y = -REACH + t * REACH * 2;
      const a = t * turns * Math.PI * 2 + ((i % arms) / arms) * Math.PI * 2;
      const h = field(Math.cos(a) * 0.3, y / CELL, Math.sin(a) * 0.3);
      const radius = 50 + h * (REACH - 70) + (1 - st.order) * (r() - 0.5) * 60;
      const s = (5 + h * 12) * st.scale;
      instance(out, Math.cos(a) * radius, y, Math.sin(a) * radius, s, s, s, i % 9 === 0 ? 1 : 0, [0, -a, t * 3]);
    }
  },
  swarm(st, field, r, out) {
    const count = 500 + Math.round(st.density * 1000);
    const threshold = 0.35 + st.order * 0.2;
    for (let i = 0, tries = 0; i < count && tries < count * 6; tries++) {
      const x = (r() - 0.5) * REACH * 2, y = (r() - 0.5) * REACH * 2, z = (r() - 0.5) * REACH * 2;
      const h = field(x / CELL, y / CELL, z / CELL);
      if (h < threshold) continue;
      i++;
      const s = (2 + h * 7) * st.scale;
      instance(out, x, y, z, s, s, s, r() < 0.1 ? 1 : 0, [r() * 6, r() * 6, r() * 6]);
    }
  },
  // a hollow sphere of pieces facing outward; noise dents it as order drops
  shell(st, field, r, out) {
    const count = 150 + Math.round(st.density * 800);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const y = 1 - (2 * (i + 0.5)) / count, rad = Math.sqrt(1 - y * y), a = i * golden;
      dir.set(Math.cos(a) * rad, y, Math.sin(a) * rad);
      const h = field(dir.x * 0.5, dir.y * 0.5, dir.z * 0.5);
      if (h < 0.3 * (1 - st.density)) continue;
      const R = 100 + (REACH - 110) * (st.order + (1 - st.order) * h);
      const s = (6 + h * 14) * st.scale;
      instance(out, dir.x * R, dir.y * R, dir.z * R, s, s, s * 0.35, h > 0.7 ? 1 : 0, { axis: "z", dir });
    }
  },
  // a flat galaxy of pieces winding around the centre
  vortex(st, field, r, out) {
    const count = 400 + Math.round(st.density * 1000);
    const arms = 2 + Math.round(st.twist * 3);
    for (let i = 0; i < count; i++) {
      const rad = 20 + Math.sqrt(r()) * (REACH - 20);
      const a = ((i % arms) / arms) * Math.PI * 2 + rad * 0.012 * (1 + st.twist * 3) + (1 - st.order) * (r() - 0.5) * 1.5;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      const h = field(x / CELL, 0, z / CELL);
      const y = (r() - 0.5) * (1 - st.order) * 80 + (h - 0.5) * 70 * (1 - rad / REACH);
      const s = (3 + h * 9) * st.scale;
      instance(out, x, y, z, s, s, s, h > 0.7 ? 1 : 0, [r() * 6, a, 0]);
    }
  },
  // strands that grow from the centre and follow the grain of the noise
  tendrils(st, field, r, out) {
    const strands = 4 + Math.round(st.density * 14);
    const steps = 50 + Math.round(Math.min(st.scale, 2) * 25);
    const stride = 9, e = 0.02;
    for (let s = 0; s < strands; s++) {
      v.set((r() - 0.5) * 90, (r() - 0.5) * 90, (r() - 0.5) * 90);
      unit(r, dir);
      for (let k = 0; k < steps; k++) {
        const x = v.x / CELL, y = v.y / CELL, z = v.z / CELL;
        grad.set(field(x + e, y, z) - field(x - e, y, z), field(x, y + e, z) - field(x, y - e, z), field(x, y, z + e) - field(x, y, z - e));
        if (grad.lengthSq() > 0) grad.normalize();
        dir.multiplyScalar(0.7 + st.order * 0.6).addScaledVector(grad, (1 - st.order) * 0.9);
        dir.x += (r() - 0.5) * 0.25; dir.y += (r() - 0.5) * 0.25; dir.z += (r() - 0.5) * 0.25;
        dir.normalize();
        v.addScaledVector(dir, stride);
        if (Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) > REACH) break;
        const size = (2 + 9 * (1 - k / steps)) * st.scale;
        instance(out, v.x, v.y, v.z, size, size, size * 1.6, k % 11 === 0 ? 1 : 0, { axis: "z", dir });
      }
    }
  },
  // a floor of tiles; noise makes it terrain and tears holes in it
  plane(st, field, r, out) {
    const n = 12 + Math.round(st.density * 16);
    const step = (REACH * 2) / n, amp = (1 - st.order) * 170;
    const w = step * (0.55 + 0.4 * Math.min(st.scale, 1.5) / 1.5);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = -REACH + (i + 0.5) * step, z = -REACH + (j + 0.5) * step;
      const h = field(x / CELL, 0.3, z / CELL);
      if (h < 0.25 * (1 - st.density)) continue;
      const y = (h - 0.5) * amp + Math.sin((x + z) * 0.02) * st.twist * 40;
      instance(out, x, y, z, w, 2.5 * st.scale, w, h > 0.7 ? 1 : 0);
    }
  },
  // nested frames: the edges of cubes inside cubes
  cage(st, field, r, out) {
    const nested = 1 + Math.round(st.density * 4);
    for (let k = 0; k < nested; k++) {
      const half = REACH * 0.95 * (1 - k / (nested + 0.5));
      const size = (4 + k * 1.5) * st.scale, spacing = size * (1.6 + (1 - st.order) * 2.5);
      const euler = new THREE.Euler(st.twist * k * 0.5, st.twist * k * 0.8, 0);
      for (let axis = 0; axis < 3; axis++) for (const a of [-1, 1]) for (const b of [-1, 1]) {
        for (let t = -half; t <= half; t += spacing) {
          const p = [0, 0, 0];
          p[axis] = t; p[(axis + 1) % 3] = a * half; p[(axis + 2) % 3] = b * half;
          v.fromArray(p).applyEuler(euler);
          instance(out, v.x, v.y, v.z, size, size, size, k % 2, [euler.x, euler.y, 0]);
        }
      }
    }
  },
  // flights of steps that climb, and turn as they climb
  stairs(st, field, r, out) {
    const flights = 1 + Math.round(st.density * 5);
    const run = 11 * st.scale, rise = 5 * st.scale, width = 34 * st.scale;
    for (let f = 0; f < flights; f++) {
      v.set((r() - 0.5) * REACH * 1.2, -REACH * (0.4 + r() * 0.5), (r() - 0.5) * REACH * 1.2);
      let heading = r() * Math.PI * 2;
      const turn = (st.twist - 0.3) * 0.12 * (r() < 0.5 ? 1 : -1), steps = 30 + Math.round(r() * 60);
      for (let k = 0; k < steps; k++) {
        v.x += Math.cos(heading) * run; v.z += Math.sin(heading) * run; v.y += rise;
        heading += turn + (1 - st.order) * (r() - 0.5) * 0.15;
        if (Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) > REACH) break;
        instance(out, v.x, v.y, v.z, run * 1.15, 2 * st.scale, width, k % 10 === 0 ? 1 : 0, [0, -heading, 0]);
      }
    }
  },
  // one great block, split again and again, with noise deciding which pieces are missing
  fracture(st, field, r, out) {
    const maxDepth = 2 + Math.round(st.density * 2), threshold = 0.38 + 0.12 * (1 - st.density);
    const split = (cx, cy, cz, half, depth) => {
      const h = field((cx / CELL) * 1.3, (cy / CELL) * 1.3, (cz / CELL) * 1.3);
      if (depth > 0 && h < threshold - depth * 0.02) return;
      if (depth >= maxDepth || (depth > 0 && r() < st.order * 0.35)) {
        const s = half * 2 * 0.88, loose = st.twist > 0.5 ? st.twist * 0.4 : 0;
        return instance(out, cx, cy, cz, s, s, s, h > 0.68 ? 1 : 0, loose ? [(r() - 0.5) * loose, (r() - 0.5) * loose, 0] : null);
      }
      const q = half / 2;
      for (const dx of [-q, q]) for (const dy of [-q, q]) for (const dz of [-q, q]) split(cx + dx, cy + dy, cz + dz, q, depth + 1);
    };
    split(0, 0, 0, REACH * 0.85 * Math.min(st.scale, 1.3) / 1.3, 0);
  },
  // floors of thin walls: rooms and corridors with no reason to be here
  maze(st, field, r, out) {
    const n = 6 + Math.round(st.density * 9), step = (REACH * 2) / n;
    const wallH = 40 + 50 * Math.min(st.scale, 2) / 2, floors = 1 + Math.round(st.twist * 2);
    for (let f = 0; f < floors; f++) {
      const y0 = -(floors - 1) * (wallH + 50) / 2 + f * (wallH + 50) - wallH / 2;
      instance(out, 0, y0, 0, REACH * 2, 2, REACH * 2, 0);
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
        const x = -REACH + i * step, z = -REACH + j * step;
        const tint = field(x / CELL, f, z / CELL) > 0.68 ? 1 : 0;
        const skew = st.order > 0.6 ? 0 : (r() - 0.5) * (1 - st.order) * 0.5;
        if (i < n && r() < 0.5) instance(out, x + step / 2, y0 + wallH / 2, z, step, wallH, 3, tint, [0, skew, 0]);
        if (j < n && r() < 0.5) instance(out, x, y0 + wallH / 2, z + step / 2, 3, wallH, step, tint, [0, skew, 0]);
      }
    }
  },
  // blocks of buildings with streets between them; noise decides the skyline and the empty lots
  city(st, field, r, out) {
    const n = 5 + Math.round(st.density * 6), step = (REACH * 2) / n;
    const lot = step * (0.62 + 0.2 * st.density), ground = -REACH * 0.55;
    instance(out, 0, ground - 1, 0, REACH * 2, 2, REACH * 2, 0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = -REACH + (i + 0.5) * step, z = -REACH + (j + 0.5) * step;
      const h = field(x / CELL, 0, z / CELL);
      if (h < 0.25 * (1 - st.density)) continue;
      const parts = r() < 0.45 + st.order * 0.4 ? 1 : 2;
      for (let a = 0; a < parts; a++) for (let b = 0; b < parts; b++) {
        if (parts > 1 && r() < 0.2) continue;
        const w = (lot / parts) * 0.9;
        const bx = x + (a - (parts - 1) / 2) * (lot / parts), bz = z + (b - (parts - 1) / 2) * (lot / parts);
        const floors = 1 + Math.round(h * h * 16 * st.scale * (0.4 + r()));
        const height = floors * w * 0.5, yaw = (1 - st.order) * (r() - 0.5) * st.twist;
        instance(out, bx, ground + height / 2, bz, w, height, w, h > 0.74 ? 1 : 0, [0, yaw, 0]);
        if (floors > 6 && r() < 0.45) {
          const top = Math.round(floors * (0.2 + r() * 0.4)) * w * 0.3;
          instance(out, bx, ground + height + top / 2, bz, w * 0.6, top, w * 0.6, 1, [0, yaw, 0]);
        }
      }
    }
  },
  // a thing that contains itself: the same shell of pieces again and again, each smaller and turned,
  // all the way down. The world makes the descent endless (see Cell.update).
  recursion(st, field, r, out) {
    const k = 1.5 + (Math.min(st.scale, 3) / 3) * 0.9, theta = st.twist * 1.1;
    const levels = Math.ceil(Math.log(REACH / 0.7) / Math.log(k));
    const count = 6 + Math.round(st.density * 14), golden = Math.PI * (3 - Math.sqrt(5));
    const motif = Array.from({ length: count }, (_, i) => {
      const y = 1 - (2 * (i + 0.5)) / count, rad = Math.sqrt(1 - y * y), a = i * golden;
      const d = new THREE.Vector3(Math.cos(a) * rad, y, Math.sin(a) * rad), h = field(d.x * 0.5, d.y * 0.5, d.z * 0.5);
      return { d, h, radius: 1 - (1 - st.order) * 0.4 * h };
    });
    out.fractal = { k, theta };
    for (let level = 0; level < levels; level++) {
      const R = REACH * k ** -level;
      for (const m of motif) {
        dir.copy(m.d).applyAxisAngle(Y, level * theta);
        const size = R * (0.14 + 0.2 * m.h);
        instance(out, dir.x * R * m.radius, dir.y * R * m.radius, dir.z * R * m.radius, size, size, size * 0.5, m.h > 0.7 ? 1 : 0, { axis: "z", dir });
      }
    }
  },
  // The origin: a cluster of glass prisms ringed by twelve cubes, after the PS2 system clock.
  hub(st, field, r, out) {
    for (let i = 0; i < 9; i++) {
      instance(out, 0, 0, 0, 5 + r() * 5, 90 + r() * 80, 5 + r() * 5, i % 3 === 0 ? 1 : 0, [r() * Math.PI, r() * Math.PI, r() * Math.PI]);
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      instance(out, Math.cos(a) * 110, 0, Math.sin(a) * 110, 11, 11, 11, i % 3 === 0 ? 1 : 0, [0, -a, 0]);
    }
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      instance(out, Math.cos(a) * 190, 0, Math.sin(a) * 190, 3, 3, 3, 0, [0, -a, 0]);
    }
  },
  none() {},
};

export const KINDS = Object.keys(GENERATORS).filter((k) => k !== "hub");

const turn = new THREE.Matrix4(), stretch = new THREE.Vector3();

// Every layer of a sector as instance lists, ready to become instanced meshes.
export function buildLayers(spec, seed) {
  return spec.layers.map((layer, index) => {
    const r = mulberry32(seed + index * 7919);
    const base = [];
    base.cap = Math.floor(MAX_PER_LAYER / layer.symmetry);
    GENERATORS[layer.kind](layer, makeField(seed + index * 131, spec.noise), r, base);
    stretch.set(layer.stretch.x, layer.stretch.y, layer.stretch.z);
    for (const inst of base) inst.matrix.scale(stretch);
    // rotational symmetry: the whole arrangement repeated around the vertical axis
    const instances = [...base];
    for (let k = 1; k < layer.symmetry; k++) {
      turn.makeRotationY((k / layer.symmetry) * Math.PI * 2);
      for (const inst of base) instances.push({ matrix: turn.clone().multiply(inst.matrix), tint: inst.tint });
    }
    return {
      instances, layer,
      fractal: base.fractal ?? null,
      // cube columns read as stacked blocks; city blocks get twice as many rows, which read as floors
      bands: layer.primitive !== "cube" ? 0 : layer.kind === "towers" ? 1 : layer.kind === "city" ? 2 : 0,
      tiltZ: (r() - 0.5) * layer.tilt * 2,
    };
  });
}

const clampTo = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const part = new THREE.Object3D(), RAD = Math.PI / 180;

// A blueprint is how a sector holds something built on purpose: a house, a street, a monument.
// One part per line:  solid x y z sx sy sz [ry [rx [rz]]] [!]     (! = accent colour, angles in degrees)
// A line may be repeated by prefixes:  rep N dx dy dz | ...   and   ring N radius | ...
export function buildBlueprint(text) {
  const groups = new Map();
  let total = 0;
  for (const raw of text.split(/[\n;]/).slice(0, 160)) {
    const stages = raw.split("|").map((stage) => stage.trim().split(/\s+/)).filter((stage) => stage[0]);
    const tokens = stages.pop();
    if (!tokens || !PRIMITIVES[tokens[0]]) continue;
    const accent = tokens.at(-1) === "!";
    const n = tokens.slice(1, accent ? -1 : undefined).map(Number);
    if (n.length < 6 || n.some((value) => !Number.isFinite(value))) continue;
    part.position.set(clampTo(n[0], -300, 300), clampTo(n[1], -300, 300), clampTo(n[2], -300, 300));
    part.scale.set(clampTo(Math.abs(n[3]), 0.5, 560), clampTo(Math.abs(n[4]), 0.5, 560), clampTo(Math.abs(n[5]), 0.5, 560));
    part.rotation.set((n[7] ?? 0) * RAD, (n[6] ?? 0) * RAD, (n[8] ?? 0) * RAD, "YXZ");
    part.updateMatrix();

    let copies = [new THREE.Matrix4()];
    for (const [op, count, ...args] of stages) {
      const times = clampTo(Math.round(Number(count)) || 1, 1, 64), [p, q, w] = args.map(Number).map((value) => value || 0);
      const next = [];
      for (const base of copies) for (let i = 0; i < times && next.length < MAX_PER_LAYER; i++) {
        const m = op === "ring"
          ? new THREE.Matrix4().makeRotationY((i / times) * Math.PI * 2).multiply(new THREE.Matrix4().makeTranslation(p, 0, 0))
          : new THREE.Matrix4().makeTranslation(i * p, i * q, i * w);
        next.push(base.clone().multiply(m));
      }
      copies = next;
    }
    if (!groups.has(tokens[0])) groups.set(tokens[0], []);
    for (const copy of copies) {
      if (total++ >= MAX_PER_LAYER) break;
      groups.get(tokens[0]).push({ matrix: copy.multiply(part.matrix), tint: accent ? 1 : 0 });
    }
  }
  return [...groups].map(([primitive, instances]) => ({ primitive, instances }));
}
