// Portals whose source does not answer (a plugin's site down, its instance not running: the server says
// which, /api/portals, as each plugin tells it): drawn grey in the hub, and dimmer, easing into it and back
// out once it answers again. Each plugin draws its ring its own way, so whatever stands at its place on
// the circle (as forming.js finds it) has the end of its every material's colour turned grey, by as much
// as that plugin's own uniform says; only in the void, never in a plugin's own dimensions (which may draw
// with the same materials). A ring is taken for one once it has stood still there a moment (one passing,
// someone else's light, is not); and one still forming there (its plugin puts up its ring only once it
// hears from its source) is greyed as it is, and stays (see forming.js).
import { hubSlot, portalNames } from "./constants.js";

const ASK = 15;          // s between asks
const LOOK = 2;          // s between looks for what stands at a grey portal's place
const NEAR = 450;        // as forming.js: anything this near its place is its ring
const EASE = 1.2;        // s, into grey or back out
const LUMA = "vec3(.299, .587, .114)";

export class Grey {
  // known(): what is never anyone's ring (forming.js's: what was there before any plugin, and its own);
  // forming(name): the one still forming in its place, if it is
  constructor({ scene, world, known, forming }) {
    this.scene = scene;
    this.world = world;
    this.known = known;
    this.forming = forming;
    this.grey = new Set();    // the plugins whose source does not answer
    this.amount = new Map();  // name -> { value }: the uniform each of its materials greys by
    this.seen = new Map();    // object -> where it stood at the last look (a ring stands still)
    this.patched = new WeakSet();
    this.asking = 0;
    this.looking = 0;
  }

  has(name) {
    return this.grey.has(name);
  }

  async ask() {
    const data = await fetch("/api/portals", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null), () => null);
    if (data) this.grey = new Set(Array.isArray(data.unreachable) ? data.unreachable : []);
  }

  // each frame
  update(dt) {
    if ((this.asking -= dt) <= 0) { this.asking = ASK; this.ask(); }
    if ((this.looking -= dt) <= 0) { this.looking = LOOK; this.look(); }
    const inVoid = this.world.realm === "void";
    for (const [name, u] of this.amount) {
      const want = inVoid && this.grey.has(name) ? 1 : 0;
      u.value = want > u.value ? Math.min(want, u.value + dt / EASE) : Math.max(want, u.value - dt / EASE);
    }
  }

  // what stands still at a grey portal's place: its materials made to grey by that portal's uniform
  look() {
    const known = this.known(), now = new Map();
    const places = [...this.grey].filter((name) => portalNames().includes(name)).map((name) => ({ name, at: hubSlot(name).at }));
    if (!places.length) return void this.seen.clear();
    for (const { name } of places) { const standIn = this.forming(name); if (standIn) this.take(standIn, name); }
    for (const object of this.scene.children) {
      if (known.has(object) || !object.children.length) continue;
      const p = object.position;
      const place = places.find(({ at }) => Math.hypot(p.x - at[0], p.y - at[1], p.z - at[2]) < NEAR);
      if (!place) continue;
      now.set(object, p.clone());
      if (this.seen.get(object)?.distanceTo(p) < 1) this.take(object, place.name);
    }
    this.seen = now;
  }

  take(object, name) {
    let u = this.amount.get(name);
    if (!u) this.amount.set(name, (u = { value: 0 }));
    object.traverse((o) => { for (const m of [].concat(o.material ?? [])) this.patch(m, u); });
  }

  // a material's colour, at its very end, turned grey by u (its own shader left as it is otherwise)
  patch(material, u) {
    if (this.patched.has(material) || material.isRawShaderMaterial) return; // (raw: its own precision and output, left alone)
    this.patched.add(material);
    const before = material.onBeforeCompile, key = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
      before?.call(material, shader, renderer);
      const src = shader.fragmentShader, end = src.lastIndexOf("}");
      // (gl_FragColor, as three gives every shader but one of GLSL 3's own, which names its output itself)
      const out = material.glslVersion !== "300 es" || /\bgl_FragColor\b/.test(src) ? "gl_FragColor" : src.match(/\bout\s+(?:(?:highp|mediump|lowp)\s+)?vec4\s+(\w+)\s*;/)?.[1];
      if (end < 0 || !out) return;
      shader.uniforms.uVvoidGrey = u;
      shader.fragmentShader = `uniform float uVvoidGrey;\n${src.slice(0, end)}  ${out}.rgb = mix(${out}.rgb, vec3(dot(${out}.rgb, ${LUMA})) * .55, uVvoidGrey);\n}${src.slice(end + 1)}`;
    };
    material.customProgramCacheKey = () => `${key}|grey`;
    material.needsUpdate = true;
  }
}
