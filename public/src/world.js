// The void: a grid of cubic sectors around the player. Each starts as faint dust
// and materializes once its spec arrives (from Claude via the server, or local noise).
import * as THREE from "three";
import { hashCoords, mulberry32 } from "./noise.js";
import { ORIGIN, localSpec, voidSpec, normalizeSpec } from "./spec.js";
import { population } from "./population.js";
import { PRIMITIVES, buildLayers, buildBlueprint } from "./structures.js";
import { CELL, UNIT, SIGHT } from "./constants.js";
import {
  SKY_VERT, skyFrag, fieldCompiles, DEFAULT_FIELD,
  BOX_VERT, BOX_FRAG, MOTE_VERT, MOTE_FRAG, ORB_VERT, ORB_FRAG,
} from "./shaders.js";

export { CELL };
const MATERIALIZE_SECONDS = 3.5;
const FRACTAL_REACH = 110 * UNIT; // within this distance of a recursion's centre, flight slows
const FRACTAL_FLOOR = 7 * UNIT;   // and this close, the traveller is moved one level back out

const key = (x, y, z) => `${x},${y},${z}`;
const dummy = new THREE.Object3D();

const DRIFT = {
  rise: [0, 1, 0], fall: [0, -1, 0], stream: [1, 0.05, 0.3], orbit: [0, 0, 0], still: [0, 0, 0],
};

function whisperSprite(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  ctx.font = '300 40px "Helvetica Neue", Helvetica, Arial, sans-serif';
  if ("letterSpacing" in ctx) ctx.letterSpacing = "6px";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, 512, 48, 1000);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture, transparent: true, depthWrite: false, fog: false, opacity: 0, blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(170, 16, 1);
  return sprite;
}

class Cell {
  constructor(world, x, y, z) {
    this.world = world;
    this.coords = [x, y, z];
    this.seed = hashCoords(x, y, z);
    this.group = new THREE.Group();
    this.group.position.set(x * CELL, y * CELL, z * CELL);
    this.spec = null;
    this.mat = { value: 0 };
    this.built = { value: 0 };
    this.disposables = [];
    this.whispers = [];
    this.structures = [];

    // faint dust so an unmaterialized sector is not pure nothing
    const dust = this.points(320, mulberry32(this.seed ^ 0x51ed), {
      uColor: { value: new THREE.Color("#8fa0c8") }, uSize: { value: 0.7 }, uDrift: { value: new THREE.Vector3(0, 1.5, 0) },
      uOrbit: { value: 0 }, uMat: { value: 0.5 },
    });
    this.group.add(dust);
    world.scene.add(this.group);
  }

  points(count, r, uniforms) {
    const G = this.world.G;
    const geometry = new THREE.BufferGeometry();
    const position = new Float32Array(count * 3), seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      position[i * 3] = (r() - 0.5) * CELL;
      position[i * 3 + 1] = (r() - 0.5) * CELL;
      position[i * 3 + 2] = (r() - 0.5) * CELL;
      seed[i] = r();
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    const material = new THREE.ShaderMaterial({
      vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG,
      uniforms: { uTime: G.uTime, uPx: G.uPx, uFogDensity: G.uFogDensity, uLight: G.uLight, uHigh: G.uHigh, uCell: { value: CELL }, ...uniforms },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    this.disposables.push(geometry, material);
    return points;
  }

  materialize(spec) {
    if (this.spec) {
      // the rest of a sector whose geometry arrived early
      if (this.spec.partial && !spec.partial) {
        this.spec = spec;
        this.addBlueprint(spec);
        this.addWhispers(spec);
      }
      return;
    }
    this.spec = spec;
    const G = this.world.G;
    const r = mulberry32(this.seed);
    const glow = new THREE.Color(spec.palette.glow), accent = new THREE.Color(spec.palette.accent);

    for (const { instances, layer, bands, tiltZ, fractal } of buildLayers(spec, this.seed)) {
      const mesh = this.addMesh(layer.primitive, instances, spec, this.mat, bands, 0, fractal);
      if (!mesh) continue;
      mesh.position.y = layer.lift * 170 * UNIT;
      // a recursion stays upright: its descent turns about the vertical
      if (!fractal) mesh.rotation.set(layer.tilt * 1.2, 0, tiltZ);
      this.structures.push({ mesh, spin: layer.spin, fractal });
    }
    if (!spec.partial) this.addBlueprint(spec);

    const moteCount = Math.round(spec.motes.density * 2600);
    if (moteCount) {
      const speed = spec.motes.speed * 28;
      const drift = new THREE.Vector3(...DRIFT[spec.motes.drift]).multiplyScalar(speed);
      this.group.add(this.points(moteCount, r, {
        uColor: { value: glow.clone().lerp(accent, 0.3) }, uSize: { value: spec.motes.size }, uDrift: { value: drift },
        uOrbit: { value: spec.motes.drift === "orbit" ? spec.motes.speed * 0.25 : 0 }, uMat: this.mat,
      }));
    }

    if (spec.orbs.count) {
      const n = spec.orbs.count;
      const geometry = new THREE.BufferGeometry();
      const orbit = new Float32Array(n * 4), color = new Float32Array(n * 3);
      const hub = spec.hub;
      for (let i = 0; i < n; i++) {
        const radius = (hub ? 150 : 70 + r() * 170) * UNIT;
        orbit.set([radius, (i / n) * Math.PI * 2, hub ? 0.25 : (r() - 0.5) * 1.6, (hub ? 0.22 : 0.08 + r() * 0.25) * (r() < 0.5 || hub ? 1 : -1)], i * 4);
        new THREE.Color(spec.orbs.colors[i]).toArray(color, i * 3);
      }
      geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      geometry.setAttribute("aOrbit", new THREE.BufferAttribute(orbit, 4));
      geometry.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
      const material = new THREE.ShaderMaterial({
        vertexShader: ORB_VERT, fragmentShader: ORB_FRAG,
        uniforms: { uTime: G.uTime, uPx: G.uPx, uFogDensity: G.uFogDensity, uLight: G.uLight, uBass: G.uBass, uMat: this.mat },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const orbs = new THREE.Points(geometry, material);
      orbs.frustumCulled = false;
      this.group.add(orbs);
      this.disposables.push(geometry, material);
    }

    if (!spec.partial) this.addWhispers(spec);
  }

  // one instanced mesh of a single solid, lit in the sector's colours
  addMesh(primitive, instances, spec, mat, bands = 0, warp = 0, fractal = null) {
    if (!instances.length) return null;
    const G = this.world.G, r = mulberry32(this.seed ^ instances.length);
    const geometry = PRIMITIVES[primitive].clone();
    const seeds = new Float32Array(instances.length), tints = new Float32Array(instances.length);
    const material = new THREE.ShaderMaterial({
      vertexShader: BOX_VERT, fragmentShader: BOX_FRAG,
      defines: { ...(primitive === "cube" ? {} : { BARY: 1 }), ...(fractal ? { FRACTAL: 1 } : {}) },
      uniforms: {
        uFogColor: G.uFogColor, uFogDensity: G.uFogDensity, uLight: G.uLight, uTime: G.uTime, uMat: mat, uWarp: { value: warp },
        uMid: G.uMid, uBeat: G.uBeat, uNear: { value: 1e5 }, uUnit: { value: UNIT },
        uDeep: { value: new THREE.Color(spec.palette.deep) }, uGlow: { value: new THREE.Color(spec.palette.glow) },
        uAccent: { value: new THREE.Color(spec.palette.accent) }, uBands: { value: bands },
      },
    });
    const mesh = new THREE.InstancedMesh(geometry, material, instances.length);
    instances.forEach((inst, i) => {
      mesh.setMatrixAt(i, inst.matrix);
      seeds[i] = r();
      tints[i] = inst.tint;
    });
    geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
    geometry.setAttribute("aTint", new THREE.InstancedBufferAttribute(tints, 1));
    mesh.frustumCulled = false;
    mesh.scale.setScalar(UNIT);
    this.group.add(mesh);
    this.disposables.push(geometry, material, mesh); // the mesh owns the per-instance matrix buffer
    return mesh;
  }

  // the built thing arrives after the abstract geometry and grows in on its own clock
  addBlueprint(spec) {
    if (!spec.blueprint) return;
    for (const { primitive, instances } of buildBlueprint(spec.blueprint)) this.addMesh(primitive, instances, spec, this.built, 0, spec.dream * 16);
  }

  addWhispers(spec) {
    const r = mulberry32(this.seed ^ 0x77a1);
    for (const line of spec.whispers) {
      const sprite = whisperSprite(line, spec.palette.accent);
      sprite.position.set((r() - 0.5) * 420 * UNIT, (r() - 0.5) * 320 * UNIT, (r() - 0.5) * 420 * UNIT);
      sprite.scale.multiplyScalar(1.7);
      this.whispers.push(sprite);
      this.group.add(sprite);
      this.disposables.push(sprite.material.map, sprite.material);
    }
  }

  update(dt, camera) {
    if (!this.spec) return;
    if (this.mat.value < 1) this.mat.value = Math.min(1, this.mat.value + dt / MATERIALIZE_SECONDS);
    if (!this.spec.partial && this.built.value < 1) this.built.value = Math.min(1, this.built.value + dt / MATERIALIZE_SECONDS);
    for (const { mesh, spin, fractal } of this.structures) {
      mesh.rotateY(spin * 0.12 * dt);
      if (!fractal) continue;
      // The endless descent. Near a recursion, flight slows in proportion to the distance left, so
      // each shell takes as long to pass as the last. And when the traveller gets very close they are
      // moved back out by exactly one level: the thing is self-similar, so nothing appears to change,
      // and there is always as far to go as there was.
      const centre = mesh.getWorldPosition(dummy.position), offset = dummy.scale.copy(camera.position).sub(centre);
      let distance = offset.length();
      if (distance < FRACTAL_FLOOR && distance > 1e-4) {
        camera.position.copy(centre).addScaledVector(offset, fractal.k);
        mesh.rotateY(fractal.theta);
        distance *= fractal.k;
      }
      mesh.material.uniforms.uNear.value = distance;
      this.world.slow = Math.min(this.world.slow, THREE.MathUtils.clamp(distance / FRACTAL_REACH, 0.01, 1));
    }
    const density = this.world.G.uFogDensity.value;
    for (const sprite of this.whispers) {
      const d = sprite.getWorldPosition(dummy.position).distanceTo(camera.position);
      const fog = Math.exp(-((d * density) ** 2));
      // legible at mid range; they dissolve as you fly into them
      sprite.material.opacity = 0.45 * fog * this.mat.value * this.world.G.uLight.value * THREE.MathUtils.smoothstep(d, 40, 150);
    }
  }

  dispose() {
    this.world.scene.remove(this.group);
    for (const d of this.disposables) d.dispose();
  }
}

// The nebula is the most expensive shader in the game and also the softest image, so it is
// drawn into a small offscreen target and stretched behind the scene instead of per screen pixel.
const SKY_SCALE = 0.25;

class Sky {
  constructor(world) {
    this.world = world;
    this.scene = new THREE.Scene();
    this.target = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, depthBuffer: false });
    world.scene.background = this.target.texture;
    this.size = new THREE.Vector2();
    this.geometry = new THREE.SphereGeometry(2000, 32, 16);
    this.origin = { value: new THREE.Vector3() };
    this.current = null;
    this.fading = null;
    this.setField(DEFAULT_FIELD);
  }

  mesh(body) {
    const G = this.world.G;
    const material = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: skyFrag(body),
      uniforms: {
        uTime: G.uTime, uOrigin: this.origin, uFogColor: G.uFogColor,
        uDeep: G.uDeep, uGlow: G.uGlow, uAccent: G.uAccent, uLight: G.uLight, uBass: G.uBass, uOpacity: { value: 1 },
      },
      side: THREE.BackSide, depthTest: false, depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.geometry, material);
    mesh.frustumCulled = false;
    return mesh;
  }

  // Swap in a sector's nebula function, cross-fading from the previous one.
  setField(body) {
    const check = fieldCompiles(this.world.renderer.getContext(), body);
    if (!check.ok) {
      console.warn("[cvoid] sector field failed to compile, using default:\n", check.log, "\n", body);
      body = DEFAULT_FIELD;
    }
    if (this.body === body) return check.ok;
    this.body = body;
    if (this.fading) this.drop(this.fading);
    this.fading = this.current;
    if (this.fading) {
      // the outgoing sky fades out over the new one
      this.fading.renderOrder = 1;
      this.fading.material.transparent = true;
      this.fading.material.needsUpdate = true;
    }
    this.current = this.mesh(body);
    this.scene.add(this.current);
    return check.ok;
  }

  drop(mesh) {
    this.scene.remove(mesh);
    mesh.material.dispose();
  }

  update(dt, camera) {
    this.origin.value.copy(camera.position).multiplyScalar(1 / (CELL * 1.5));
    this.current.position.copy(camera.position);
    if (this.fading) {
      this.fading.position.copy(camera.position);
      const u = this.fading.material.uniforms.uOpacity;
      u.value -= dt / 4;
      if (u.value <= 0) {
        this.drop(this.fading);
        this.fading = null;
      }
    }
  }

  render(renderer, camera) {
    renderer.getDrawingBufferSize(this.size).multiplyScalar(SKY_SCALE).ceil();
    if (this.size.x !== this.target.width || this.size.y !== this.target.height) this.target.setSize(this.size.x, this.size.y);
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, camera);
    renderer.setRenderTarget(null);
  }
}

const GHOST = normalizeSpec({
  palette: { fog: "#05060c", deep: "#010103", glow: "#3a4466", accent: "#59648a" },
  fogDensity: 0.5,
  sound: { root: 41, mode: "phrygian", shimmer: 0.05, darkness: 0.9 },
});

export class World {
  constructor(scene, renderer, { onSector, onSpec }) {
    this.scene = scene;
    this.renderer = renderer;
    this.onSector = onSector;
    this.onSpec = onSpec;
    this.G = {
      uTime: { value: 0 }, uPx: { value: 1 }, uLight: { value: 1 },
      // what the sound is doing right now; each drives a different part of the picture
      uBass: { value: 0 }, uMid: { value: 0 }, uHigh: { value: 0 }, uBeat: { value: 0 },
      uFogColor: { value: new THREE.Color(ORIGIN.palette.fog) }, uFogDensity: { value: 0.0022 / SIGHT },
      uDeep: { value: new THREE.Color(ORIGIN.palette.deep) }, uGlow: { value: new THREE.Color(ORIGIN.palette.glow) },
      uAccent: { value: new THREE.Color(ORIGIN.palette.accent) },
    };
    this.target = {
      fog: this.G.uFogColor.value.clone(), deep: this.G.uDeep.value.clone(),
      glow: this.G.uGlow.value.clone(), accent: this.G.uAccent.value.clone(), density: 0.0022 / SIGHT,
    };
    this.cells = new Map();
    this.specs = new Map([[key(0, 0, 0), normalizeSpec(ORIGIN)]]);
    this.probed = new Set();
    this.probing = new Set();
    this.pending = new Set();
    this.offline = false;
    this.currentKey = null;
    this.currentSpec = undefined;
    this.tick = 0;
    // the entity can turn the lights down and draw the fog in
    this.light = 1;
    this.fogBoost = 1;
    this.slow = 1; // flight speed factor, lowered near a recursion
    this.sky = new Sky(this);
  }

  setSpec(k, raw) {
    const known = this.specs.get(k);
    if (known && !(known.partial && !raw.partial)) return;
    this.specs.set(k, normalizeSpec(raw));
    this.onSpec(k, this.specs.get(k));
    this.cells.get(k)?.materialize(this.specs.get(k));
  }

  goOffline() {
    this.offline = true;
    // cells still waiting on a cache probe resolve themselves: the server may hold a sector Claude dreamt earlier
    for (const [k, cell] of this.cells) {
      if (!cell.spec && !this.probing.has(k)) this.setSpec(k, localSpec(...cell.coords));
    }
  }

  // Ask the server for a sector. cachedOnly never triggers a new Claude call.
  async request(x, y, z, cachedOnly) {
    const k = key(x, y, z);
    if (this.specs.has(k)) return;
    if (cachedOnly) {
      if (this.probed.has(k)) return;
      this.probed.add(k);
      this.probing.add(k);
    } else {
      // voids are never sent to Claude; the cache probe settles them (something may have been dreamt there before voids existed)
      if (population(x, y, z) === "void") return;
      if (this.offline) return this.probing.has(k) ? undefined : this.setSpec(k, localSpec(x, y, z));
      if (this.pending.has(k)) return;
      this.pending.add(k);
    }
    let status = 0, early = null;
    try {
      const res = await fetch(`/api/sector?x=${x}&y=${y}&z=${z}${cachedOnly ? "&cached=1" : ""}`);
      status = res.status;
      if (status === 200 && cachedOnly) this.setSpec(k, await res.json());
      else if (status === 200) {
        // lines arrive as Claude writes: first the geometry, then the complete sector
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          for (let nl; (nl = buffer.indexOf("\n")) >= 0; buffer = buffer.slice(nl + 1)) {
            const message = JSON.parse(buffer.slice(0, nl));
            if (message.error) status = message.offline ? 503 : 500;
            else {
              if (message.partial) early = message;
              this.setSpec(k, message);
            }
          }
        }
      } else if (res.headers.has("x-cvoid-offline")) status = 503;
    } catch {
      status = 503;
    }
    (cachedOnly ? this.probing : this.pending).delete(k);
    if (cachedOnly && status === 204 && population(x, y, z) === "void") this.setSpec(k, voidSpec());
    // the stream died after the geometry arrived: keep what we have rather than swapping the place out
    if (early && this.specs.get(k)?.partial) this.setSpec(k, { ...early, partial: false });
    if (status === 503) {
      this.setSpec(k, localSpec(x, y, z));
      this.goOffline();
    } else if (status !== 200 && status !== 204) {
      this.setSpec(k, localSpec(x, y, z));
    }
  }

  enter(spec) {
    this.currentSpec = spec;
    const s = spec ?? GHOST;
    this.target.fog.set(s.palette.fog);
    this.target.deep.set(s.palette.deep);
    this.target.glow.set(s.palette.glow);
    this.target.accent.set(s.palette.accent);
    this.target.density = (0.0017 + s.fogDensity * 0.003) / SIGHT;
    if (spec && !spec.partial) this.sky.setField(spec.fieldGlsl);
    this.onSector(spec, s, this.currentKey);
  }

  update(dt, camera) {
    const G = this.G;
    G.uTime.value += dt;
    const cx = Math.round(camera.position.x / CELL), cy = Math.round(camera.position.y / CELL), cz = Math.round(camera.position.z / CELL);

    for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) for (let z = cz - 1; z <= cz + 1; z++) {
      const k = key(x, y, z);
      if (this.cells.has(k)) continue;
      const cell = new Cell(this, x, y, z);
      this.cells.set(k, cell);
      if (this.specs.has(k)) cell.materialize(this.specs.get(k));
      else this.request(x, y, z, true);
    }
    this.slow = 1;
    for (const [k, cell] of this.cells) {
      const [x, y, z] = cell.coords;
      if (Math.max(Math.abs(x - cx), Math.abs(y - cy), Math.abs(z - cz)) > 2) {
        cell.dispose();
        this.cells.delete(k);
      } else {
        cell.update(dt, camera);
      }
    }

    // Only the sector you are in and the two you are looking toward are sent to Claude.
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = 0.4;
      this.request(cx, cy, cz, false);
      const heading = camera.getWorldDirection(dummy.scale);
      for (const reach of [0.75, 1.75]) {
        if (this.pending.size >= 3) break;
        const ahead = dummy.position.copy(camera.position).addScaledVector(heading, CELL * reach);
        this.request(Math.round(ahead.x / CELL), Math.round(ahead.y / CELL), Math.round(ahead.z / CELL), false);
      }
    }

    const k = key(cx, cy, cz);
    const spec = this.specs.get(k);
    if (k !== this.currentKey || spec !== this.currentSpec) {
      this.currentKey = k;
      this.enter(spec);
    }

    const ease = 1 - Math.exp(-dt * 0.9);
    G.uFogColor.value.lerp(this.target.fog, ease);
    G.uDeep.value.lerp(this.target.deep, ease);
    G.uGlow.value.lerp(this.target.glow, ease);
    G.uAccent.value.lerp(this.target.accent, ease);
    G.uFogDensity.value += (this.target.density * this.fogBoost - G.uFogDensity.value) * ease;
    G.uLight.value += (this.light - G.uLight.value) * (1 - Math.exp(-dt * 0.6));
    this.sky.update(dt, camera);
  }
}
