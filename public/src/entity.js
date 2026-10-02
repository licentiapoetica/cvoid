// The entity: the other thing in the void. It appears at the edge of sight, speaks in fragments,
// and names places where it will wait. What it does next is decided by Claude from what the
// traveller has been doing (POST /api/entity); a local script stands in when Claude is unreachable.
import * as THREE from "three";
import { CELL, SIGHT } from "./constants.js";

const FIRST_BEAT = 28;           // seconds of flight before it first makes itself known
const BEAT_GAP = [45, 95];       // seconds of quiet between beats
const LINE_SECONDS = 5.5;

const forward = new THREE.Vector3(), to = new THREE.Vector3(), tmp = new THREE.Vector3();
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const pickFrom = (list) => list[Math.floor(Math.random() * list.length)];

function glowTexture(draw, w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d"));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const sprite = (map, sx, sy) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map, transparent: true, depthWrite: false, fog: false, opacity: 0, blending: THREE.AdditiveBlending,
  }));
  s.scale.set(sx, sy, 1);
  s.visible = false;
  return s;
};

// Stand-in voice for when Claude can't be reached. Sparse on purpose.
const LOCAL = {
  early: ["there you are", "further", "not here", "keep going", "i saw you leave the origin", "you are slower than the last one"],
  middle: ["you came when i called. i noticed", "the dark is not empty. it is full of me", "do you count the sectors. i do",
    "i left something for you. not here", "you keep looking behind you", "nobody maps this far out"],
  late: ["there is an end. i have stood at it", "you are almost where i started", "when you stop, i stop. so do not stop",
    "i remember every place you named", "it is not a place i am leading you to"],
  arrival: ["you came", "i was here. you were slow", "closer than last time", "look how far the origin is now"],
};

export class Entity {
  constructor({ scene, world, audio, map, textEl, waitsEl, stored, store }) {
    Object.assign(this, { scene, world, audio, map, textEl, waitsEl, store });
    this.state = {
      chapter: 0, crossed: 0, seconds: 0, rendezvous: null, said: [], acts: [], recent: [],
      ...stored("entity", {}),
    };
    this.map.mark = this.state.rendezvous;
    this.nextBeat = FIRST_BEAT;
    this.act = null;
    this.fetching = false;
    this.lastKey = null;
    this.named = new Set();
    this.saveTimer = 10;
    this.hudTimer = 0;
    this.time = 0;
    this.lineTimers = [];

    // its body: a tall pale sliver of light
    this.body = sprite(glowTexture((ctx) => {
      ctx.translate(32, 128);
      ctx.scale(1, 4);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 31);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.12, "rgba(225,235,255,0.75)");
      g.addColorStop(0.4, "rgba(150,175,255,0.16)");
      g.addColorStop(1, "rgba(120,150,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(-32, -32, 64, 64);
    }, 64, 256), 60 * SIGHT, 240 * SIGHT);
    this.bodyLevel = 0;      // current brightness
    this.bodyTarget = 0;
    scene.add(this.body);

    this.eyeMap = glowTexture((ctx) => {
      for (const x of [20, 44]) {
        const g = ctx.createRadialGradient(x, 16, 0, x, 16, 11);
        g.addColorStop(0, "rgba(255,255,255,1)");
        g.addColorStop(0.3, "rgba(210,225,255,0.5)");
        g.addColorStop(1, "rgba(160,190,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - 12, 4, 24, 24);
      }
    }, 64, 32);

    const count = 140;
    this.trail = new THREE.Points(
      new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3)),
      new THREE.PointsMaterial({
        color: "#cfdcff", size: 2.6, sizeAttenuation: true, transparent: true, opacity: 0,
        depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
      }),
    );
    this.trail.frustumCulled = false;
    this.trail.visible = false;
    scene.add(this.trail);
  }

  save() {
    this.store("entity", this.state);
  }

  // ---- speech ----

  say(lines) {
    for (const t of this.lineTimers) clearTimeout(t);
    this.lineTimers = [];
    lines.forEach((line, i) => {
      this.lineTimers.push(setTimeout(() => {
        this.textEl.textContent = line;
        this.textEl.classList.add("show");
      }, i * LINE_SECONDS * 1000));
      this.lineTimers.push(setTimeout(() => this.textEl.classList.remove("show"), (i + 0.72) * LINE_SECONDS * 1000));
    });
  }

  // ---- deciding what happens ----

  async beat(event, camera, speed) {
    this.fetching = true;
    const { state, world } = this;
    const sector = world.currentKey.split(",").map(Number);
    let beat = null;
    if (!world.offline) {
      try {
        const res = await fetch("/api/entity", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            event, sector, chapter: state.chapter, minutes: state.seconds / 60, crossed: state.crossed,
            sectorName: world.currentSpec?.name, recent: state.recent, rendezvous: state.rendezvous,
            said: state.said, acts: state.acts,
            motion: speed < 6 ? "standing still" : speed > 250 ? "rushing" : "drifting forward",
          }),
        });
        if (res.ok) beat = await res.json();
      } catch { /* fall through to the local script */ }
    }
    beat ??= this.localBeat(event, sector);
    this.fetching = false;
    this.run(beat, camera);
  }

  localBeat(event, sector) {
    const { state } = this;
    const tier = event === "arrival" ? "arrival" : state.chapter < 2 ? "early" : state.chapter < 6 ? "middle" : "late";
    const fresh = LOCAL[tier].filter((l) => !state.said.includes(l));
    const lines = [pickFrom(fresh.length ? fresh : LOCAL[tier])];
    const last = state.acts.at(-1);
    let act = pickFrom(["beckon", "blackout", "watch", "trail", "silence"].filter((a) => a !== last));
    let rendezvous = null;
    if (event !== "arrival" && !state.rendezvous && (last !== undefined || Math.random() < 0.5)) {
      act = "rendezvous";
      const reach = Math.min(2 + state.chapter, 10);
      tmp.set(Math.random() - 0.5, Math.random() - 0.7, Math.random() - 0.5).normalize().multiplyScalar(reach);
      rendezvous = [sector[0] + Math.round(tmp.x), sector[1] + Math.round(tmp.y), sector[2] + Math.round(tmp.z)];
      lines.push(`i will wait at ${rendezvous.join(", ")}`);
    }
    return { act, lines, rendezvous, source: "local" };
  }

  run(beat, camera) {
    const { state } = this;
    // whatever it was doing ends first: an act given a long stretch of time cleans up after itself
    if (this.act) this.act(999, camera);
    state.acts = [...state.acts, beat.act].slice(-5);
    state.said = [...state.said, ...beat.lines].slice(-14);
    if (beat.rendezvous) {
      state.rendezvous = beat.rendezvous;
      this.map.mark = beat.rendezvous;
    }
    this.save();
    this.say(beat.lines);
    this.act = this[`act_${beat.act}`]?.(camera) ?? this.act_beckon(camera);
  }

  // ---- helpers ----

  // toward the rendezvous if there is one, otherwise a little off where the traveller is looking
  heading(camera, out) {
    const r = this.state.rendezvous;
    if (r) return out.set(r[0] * CELL, r[1] * CELL, r[2] * CELL).sub(camera.position).normalize();
    camera.getWorldDirection(out);
    out.x += rand(-0.4, 0.4); out.y += rand(-0.25, 0.25); out.z += rand(-0.4, 0.4);
    return out.normalize();
  }

  appear(position) {
    this.body.position.copy(position);
    this.body.visible = true;
    this.bodyTarget = 1;
  }

  // ---- the acts: each returns an update(dt, camera) that reports true when it is over ----

  act_beckon(camera) {
    this.appear(this.heading(camera, tmp).multiplyScalar(540 * SIGHT).add(camera.position));
    let age = 0, leaving = 0;
    return (dt, cam) => {
      age += dt;
      const distance = this.body.position.distanceTo(cam.position);
      if (!leaving && (distance < 220 * SIGHT || age > 50)) leaving = 0.001;
      if (leaving) {
        // it does not let itself be reached
        leaving += dt;
        to.copy(this.body.position).sub(cam.position).normalize();
        this.body.position.addScaledVector(to, 420 * SIGHT * dt);
        this.bodyTarget = 0;
        return leaving > 3;
      }
      return false;
    };
  }

  act_rendezvous(camera) {
    this.audio.arrive();
    return this.act_beckon(camera);
  }

  act_blackout(camera) {
    this.world.light = 0.06;
    this.world.fogBoost = 2.3;
    camera.getWorldDirection(forward);
    this.appear(tmp.copy(camera.position).addScaledVector(forward, 190 * SIGHT));
    let age = 0, ended = false;
    return (dt, cam) => {
      age += dt;
      if (!ended && (age > 17 || (age > 3 && this.body.position.distanceTo(cam.position) < 70 * SIGHT))) {
        ended = true;
        age = 100;
        this.bodyTarget = 0;
        this.bodyLevel = 0;
        this.audio.sting();
        this.world.light = 1;
        this.world.fogBoost = 1;
      }
      return age > 102;
    };
  }

  act_watch(camera) {
    camera.getWorldDirection(forward);
    const eyes = Array.from({ length: 3 + Math.floor(Math.random() * 3) }, () => {
      const eye = sprite(this.eyeMap, rand(10, 16), rand(5, 8));
      eye.position.copy(camera.position).addScaledVector(forward, -rand(120, 190));
      eye.position.x += rand(-80, 80); eye.position.y += rand(-45, 60); eye.position.z += rand(-80, 80);
      eye.visible = true;
      this.scene.add(eye);
      return eye;
    });
    const centre = new THREE.Vector3(), lastCam = camera.position.clone();
    let age = 0, seen = 0, gone = 0;
    return (dt, cam) => {
      age += dt;
      // they keep pace with the traveller but hold their place behind: turning is the only way to see them
      tmp.copy(cam.position).sub(lastCam);
      lastCam.copy(cam.position);
      centre.set(0, 0, 0);
      for (const eye of eyes) {
        eye.position.add(tmp);
        if (age > 12) eye.position.addScaledVector(to.copy(cam.position).sub(eye.position).normalize(), 9 * dt);
        centre.add(eye.position);
      }
      centre.divideScalar(eyes.length);
      cam.getWorldDirection(forward);
      const looking = forward.dot(to.copy(centre).sub(cam.position).normalize()) > 0.7;
      seen = looking ? seen + dt : 0;
      if (!gone && (seen > 0.3 || age > 40 || centre.distanceTo(cam.position) < 45)) {
        gone = 0.001;
        if (seen > 0.3) this.audio.sting();
      }
      if (gone) gone += dt;
      const level = gone ? Math.max(0, 1 - gone / 0.35) : Math.min(1, age / 2);
      for (const eye of eyes) eye.material.opacity = level * (0.7 + 0.3 * Math.sin(this.time * 3 + eye.position.x));
      if (gone > 0.4) {
        for (const eye of eyes) {
          this.scene.remove(eye);
          eye.material.dispose();
        }
        return true;
      }
      return false;
    };
  }

  act_trail(camera) {
    const dir = this.heading(camera, new THREE.Vector3());
    const side = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(dir, side);
    const position = this.trail.geometry.attributes.position, count = position.count;
    this.trail.visible = true;
    let age = 0;
    return (dt, cam) => {
      age += dt;
      for (let i = 0; i < count; i++) {
        const t = (i / count + this.time * 0.045) % 1, wave = i * 2.399;
        tmp.copy(cam.position).addScaledVector(dir, 50 + t * 850)
          .addScaledVector(side, Math.sin(wave + t * 9) * (6 + t * 22) - 14)
          .addScaledVector(up, Math.cos(wave * 1.3 + t * 7) * (6 + t * 22) - 10);
        position.setXYZ(i, tmp.x, tmp.y, tmp.z);
      }
      position.needsUpdate = true;
      this.trail.material.opacity = 0.75 * Math.min(1, age / 3, (32 - age) / 4);
      if (age > 32) {
        this.trail.visible = false;
        return true;
      }
      return false;
    };
  }

  act_silence() {
    this.audio.hush(9);
    this.world.light = 0.4;
    let age = 0;
    return (dt) => {
      age += dt;
      if (age > 9) this.world.light = 1;
      return age > 11;
    };
  }

  arrive(camera, speed) {
    const { state } = this;
    state.chapter++;
    state.rendezvous = null;
    this.map.mark = null;
    this.save();
    this.audio.arrive();
    this.world.G.uLight.value = 2.4; // the place flares as you cross into it, then settles
    this.bodyTarget = 0;
    this.beat("arrival", camera, speed);
  }

  update(dt, camera, speed) {
    const { state, world } = this;
    this.time += dt;
    state.seconds += dt;

    const key = world.currentKey;
    if (key && key !== this.lastKey) {
      if (this.lastKey) state.crossed++;
      this.lastKey = key;
    }
    const name = world.currentSpec?.name;
    if (key && name && world.currentSpec.source !== "void" && !this.named.has(key)) {
      this.named.add(key);
      state.recent = [...state.recent, name].slice(-6);
    }

    if (state.rendezvous && key === state.rendezvous.join(",") && !this.fetching) this.arrive(camera, speed);

    if (this.act) {
      if (this.act(dt, camera)) {
        this.act = null;
        this.nextBeat = rand(...BEAT_GAP);
      }
    } else if (!this.fetching && (this.nextBeat -= dt) <= 0) {
      this.beat("beat", camera, speed);
    }

    // the body: fades rather than pops, flickers a little, hums from where it stands
    this.bodyLevel += (this.bodyTarget - this.bodyLevel) * (1 - Math.exp(-dt * (this.bodyTarget ? 0.7 : 2.5)));
    this.body.material.opacity = this.bodyLevel * (0.82 + 0.18 * Math.sin(this.time * 7.3) * Math.sin(this.time * 1.7));
    if (this.bodyLevel < 0.01 && !this.bodyTarget) this.body.visible = false;
    if (this.body.visible) {
      to.copy(this.body.position).sub(camera.position);
      const distance = to.length();
      tmp.set(1, 0, 0).applyQuaternion(camera.quaternion);
      this.audio.entityVoice(this.bodyLevel * Math.min(1, (260 * SIGHT) / distance), THREE.MathUtils.clamp(to.normalize().dot(tmp), -1, 1));
    } else this.audio.entityVoice(0, 0);

    if ((this.hudTimer -= dt) <= 0) {
      this.hudTimer = 0.5;
      const r = state.rendezvous;
      if (r) {
        const away = tmp.set(r[0] * CELL, r[1] * CELL, r[2] * CELL).distanceTo(camera.position) / CELL;
        this.waitsEl.textContent = `it waits at ${r.join(", ")} · ${away.toFixed(1)} sectors away`;
      } else this.waitsEl.textContent = "";
    }
    if ((this.saveTimer -= dt) <= 0) {
      this.saveTimer = 10;
      this.save();
    }
  }
}
