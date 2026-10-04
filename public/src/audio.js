// Synthesized ambience: a drone per sector, bell shimmer, wind from speed. No samples.

const MODES = {
  minor: [0, 3, 7, 10, 12, 15],
  dorian: [0, 2, 3, 7, 9, 12],
  lydian: [0, 4, 6, 7, 11, 12],
  phrygian: [0, 1, 5, 7, 8, 12],
  whole: [0, 2, 4, 6, 8, 10],
  pentatonic: [0, 2, 4, 7, 9, 12],
};
const semis = (n) => 2 ** (n / 12);

export class VoidAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.volume = 1; // the player's volume, 0..1 (the slider)
    this.sound = { root: 55, mode: "lydian", shimmer: 0.5, darkness: 0.45, pulse: 0, tempo: 60 };
    this.levels = { bass: 0, mid: 0, high: 0, beat: 0 };
    this.averages = { bass: 0, mid: 0, high: 0 };
    this.hits = []; // heartbeat hits scheduled but not yet heard
    this.mic = null;
  }

  start() {
    if (this.ctx) return;
    const ctx = (this.ctx = new AudioContext());
    const now = ctx.currentTime;

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.gain.linearRampToValueAtTime(this.level, now + 4);
    const limiter = ctx.createDynamicsCompressor();
    this.master.connect(limiter).connect(ctx.destination);

    // a wide hall over everything (the drone, whatever plays, every sound): silent until the entity opens
    // it up now and then (see Entity.meddle)
    this.space = ctx.createGain();
    this.space.gain.value = 0;
    const hall = ctx.createConvolver();
    hall.buffer = this.hall(ctx, 4.5);
    this.master.connect(this.space).connect(hall).connect(limiter);
    this.warpCents = 0;
    this.played = new Set(); // media elements playing in the world (as weak references), bent with the rest

    // what the picture listens to: the game's own sound, or the microphone when that is switched on
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.55;
    this.analyser.maxDecibels = -12;
    this.spectrum = new Uint8Array(this.analyser.frequencyBinCount);
    this.master.connect(this.analyser);

    // cheap reverb: two cross-fed delays through a low-pass
    this.reverb = ctx.createGain();
    const wet = ctx.createGain();
    wet.gain.value = 0.7;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 2200;
    const a = ctx.createDelay(1), b = ctx.createDelay(1), fa = ctx.createGain(), fb = ctx.createGain();
    a.delayTime.value = 0.37;
    b.delayTime.value = 0.53;
    fa.gain.value = fb.gain.value = 0.62;
    this.reverb.connect(a);
    this.reverb.connect(b);
    a.connect(fa).connect(damp).connect(b);
    b.connect(fb).connect(a);
    a.connect(wet);
    b.connect(wet);
    wet.connect(this.master);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.Q.value = 0.8;
    this.droneLevel = ctx.createGain(); // lets the drone step back when other music plays
    this.filter.connect(this.droneLevel);
    this.droneLevel.connect(this.master);
    this.droneLevel.connect(this.reverb);

    const lfo = ctx.createOscillator(), lfoDepth = ctx.createGain();
    lfo.frequency.value = 0.05;
    lfoDepth.gain.value = 120;
    lfo.connect(lfoDepth).connect(this.filter.frequency);
    lfo.start();

    // drone voices: sub, root, fifth, colour tone
    this.voices = [["sine", 0.5], ["sawtooth", 0.07], ["sine", 0.18], ["triangle", 0.1]].map(([type, level], i) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = type;
      osc.detune.value = (i - 1.5) * 4;
      gain.gain.value = level;
      osc.connect(gain).connect(this.filter);
      osc.start();
      return osc;
    });

    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const wind = ctx.createBufferSource();
    wind.buffer = this.noise = noise;
    wind.loop = true;
    this.windBand = ctx.createBiquadFilter();
    this.windBand.type = "bandpass";
    this.windBand.Q.value = 0.9;
    // and its hiss taken off the top: a soft rush of air, not static
    const soft = ctx.createBiquadFilter();
    soft.type = "lowpass";
    soft.frequency.value = 2200;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(this.windBand).connect(soft).connect(this.windGain).connect(this.master);
    wind.start();

    // the entity's voice: two close tones beating against each other, placed left or right of you
    this.voiceGain = ctx.createGain();
    this.voiceGain.gain.value = 0;
    this.voicePan = ctx.createStereoPanner();
    [[196, 1], [197.7, 1], [393.1, 0.3]].forEach(([frequency, level]) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.frequency.value = frequency;
      gain.gain.value = level;
      osc.connect(gain).connect(this.voiceGain);
      osc.start();
    });
    this.voiceGain.connect(this.voicePan);
    this.voicePan.connect(this.master);
    this.voicePan.connect(this.reverb);

    this.setSector(this.sound, 0.01);
    this.boot();
    this.scheduleShimmer();
    this.schedulePulse();
  }

  ratios() {
    const colour = MODES[this.sound.mode][1];
    return [0.5, 1, 1.5, 2 * semis(colour)];
  }

  setSector(sound, glide = 3) {
    this.sound = sound;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.ratios().forEach((ratio, i) => this.voices[i].frequency.setTargetAtTime(sound.root * ratio, now, glide));
    this.filter.frequency.setTargetAtTime(220 + (1 - sound.darkness) * 1500, now, glide);
  }

  setSpeed(speed) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // quiet, and rising slowly with speed; its pitch climbs too, but only so far (a surge is a
    // deeper rush, not a higher hiss)
    this.windGain.gain.setTargetAtTime(Math.min(speed / 450, 1) ** 1.6 * 0.1, now, 0.4);
    this.windBand.frequency.setTargetAtTime(Math.min(220 + speed * 1.4, 1400), now, 0.4);
  }

  ping(frequency, level, decay, when = this.ctx.currentTime) {
    const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(level, when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + decay);
    osc.connect(gain);
    gain.connect(this.reverb);
    gain.connect(this.master);
    osc.start(when);
    osc.stop(when + decay + 0.1);
  }

  // rising swell when the void first materializes
  boot() {
    const now = this.ctx.currentTime;
    const scale = MODES[this.sound.mode];
    this.ping(this.sound.root, 0.5, 6, now);
    scale.slice(0, 5).forEach((s, i) => this.ping(this.sound.root * 4 * semis(s), 0.05, 5, now + 0.6 + i * 0.35));
  }

  // a chime when a sector finishes materializing around you
  arrive() {
    if (!this.ctx) return;
    const scale = MODES[this.sound.mode];
    [0, 2, 4].forEach((d, i) => this.ping(this.sound.root * 4 * semis(scale[d]), 0.04, 4, this.ctx.currentTime + i * 0.18));
  }

  // The sector's heartbeat: two soft low hits per beat. Its loudness is the sector's `pulse`.
  schedulePulse() {
    const beat = 60 / this.sound.tempo;
    if (this.ctx.state === "running" && this.sound.pulse > 0.04) {
      const now = this.ctx.currentTime;
      for (const [offset, level] of [[0, 1], [0.3 * beat, 0.6]]) {
        const osc = this.ctx.createOscillator(), gain = this.ctx.createGain(), at = now + 0.05 + offset;
        osc.frequency.setValueAtTime(78, at);
        osc.frequency.exponentialRampToValueAtTime(36, at + 0.22);
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(this.sound.pulse * level * 0.9, at + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.38);
        osc.connect(gain).connect(this.master);
        osc.start(at);
        osc.stop(at + 0.45);
        this.hits.push({ at, strength: level * Math.min(1, 0.35 + this.sound.pulse) });
      }
    }
    setTimeout(() => this.schedulePulse(), beat * 1000);
  }

  // Bass, mid and high energy (each 0..1, self-levelling) and a beat envelope that jumps on a
  // bass onset and decays. Each one drives a different part of the picture.
  features(dt) {
    const out = this.levels;
    if (!this.ctx || this.ctx.state !== "running") return out;
    this.analyser.getByteFrequencyData(this.spectrum);
    const hz = this.ctx.sampleRate / this.analyser.fftSize;
    const band = (lo, hi) => {
      const a = Math.max(1, Math.round(lo / hz)), b = Math.min(this.spectrum.length, Math.round(hi / hz));
      let sum = 0;
      for (let i = a; i < b; i++) sum += this.spectrum[i];
      return sum / ((b - a) * 255);
    };
    const raw = { bass: band(30, 160), mid: band(160, 2200), high: band(2200, 12000) };
    for (const name of ["bass", "mid", "high"]) {
      // measured against its own recent average: a steady drone sits low, anything that moves stands out
      const average = (this.averages[name] += (raw[name] - this.averages[name]) * Math.min(1, dt * 0.6));
      const level = Math.min(1, Math.max(0, 0.18 + ((raw[name] - average) / Math.max(average, 0.05)) * 2.5));
      out[name] += (level - out[name]) * Math.min(1, dt * (level > out[name] ? 30 : 5));
    }
    // the game knows exactly when its own heartbeat lands; the room has to be listened for
    const now = this.ctx.currentTime;
    while (this.hits.length && this.hits[0].at <= now) out.beat = Math.max(out.beat, this.hits.shift().strength);
    if ((this.mic || this.trackOn || this.zone?.heard || this.mediaOn) && raw.bass > this.averages.bass + 0.035 && out.beat < 0.4) out.beat = 1;
    out.beat *= Math.exp(-dt * 5);
    return out;
  }

  // Let the picture listen to the room instead (music playing on speakers, a voice).
  async toggleMic() {
    if (!this.ctx) return false;
    if (this.mic) {
      this.mic.source.disconnect();
      this.mic.stream.getTracks().forEach((track) => track.stop());
      this.mic = null;
      this.master.connect(this.analyser);
      return false;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const source = this.ctx.createMediaStreamSource(stream);
    this.master.disconnect(this.analyser);
    source.connect(this.analyser); // analysed only, never played back
    this.mic = { stream, source };
    return true;
  }

  // marderchen's dimension has its own music: a small bright chiptune, square waves over a kick.
  // (An original pattern, in the spirit of the chiptunes he collected.) The kick drives the beat,
  // so everything in there flashes in time, like the beat-timed light organs he built.
  setChip(on) {
    if (!this.ctx) return;
    this.chip = on;
    const now = this.ctx.currentTime;
    this.droneLevel.gain.setTargetAtTime(on ? 0.25 : 1, now, 1.5);
    if (on && !this.chipRunning) this.stepChip(0);
  }

  // the hall's echo: noise in both ears, dying away over seconds and darkening as it does
  hall(ctx, seconds) {
    const length = Math.floor(ctx.sampleRate * seconds), buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let low = 0;
      for (let i = 0; i < length; i++) {
        const t = i / length, k = 0.08 + 0.9 * t; // the further in, the softer
        low += (Math.random() * 2 - 1 - low) * (1 - k);
        data[i] = low * (1 - t) ** 2.6 * (i < ctx.sampleRate * 0.02 ? i / (ctx.sampleRate * 0.02) : 1);
      }
    }
    return buffer;
  }

  // how much of the hall is heard (0 to about 0.4)
  setSpace(amount) {
    if (!this.ctx || Math.abs(amount - (this.spaceLevel ?? 0)) < 0.002) return;
    this.spaceLevel = amount;
    this.space.gain.setTargetAtTime(amount, this.ctx.currentTime, 0.2);
  }

  // everything bent by this many cents: the drone's voices, and the media playing (played that much
  // faster or slower, their pitch let go with it)
  setWarp(cents) {
    if (!this.ctx || Math.abs(cents - this.warpCents) < 0.5) return;
    this.warpCents = cents;
    const now = this.ctx.currentTime, rate = 2 ** (cents / 1200);
    this.voices.forEach((osc, i) => osc.detune.setTargetAtTime((i - 1.5) * 4 + cents, now, 0.1));
    for (const ref of this.played) {
      const el = ref.deref();
      if (!el) { this.played.delete(ref); continue; }
      el.preservesPitch = false;
      el.playbackRate = rate;
    }
  }

  // A media element playing in the world (a plugin's: see main.js): its sound goes through the master
  // (volume, mute, the analyser, the entity's bending), at a level set by whoever plays it. Returns
  // that level's gain, or null before start.
  mediaOut(el) {
    if (!this.ctx) return null;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    const source = this.ctx.createMediaElementSource(el);
    source.connect(gain).connect(this.master);
    this.played.add(new WeakRef(el));
    if (this.warpCents) { el.preservesPitch = false; el.playbackRate = 2 ** (this.warpCents / 1200); }
    return { gain, source };
  }

  // while something a plugin plays is plainly heard, the drone steps back for it
  setMedia(on) {
    if (!this.ctx || this.mediaOn === on) return;
    this.mediaOn = on;
    this.droneLevel.gain.setTargetAtTime(on ? 0.3 : 1, this.ctx.currentTime, 1.5);
  }

  // The music of his homepage. Half a minute after the page opened, a loop began: "Break The Time
  // Out" by JW86, which he had cut to loop and kept on his webspace. It is played from the mirror
  // of his site; if that is not there, the chiptune simply carries on.
  setTrack(on) {
    if (!this.ctx || this.trackFailed) return;
    if (!this.track) {
      const el = new Audio("/museum/src/www.marderchen.lima-city.de/xyz/JW86_Break%20The%20Time%20Out_loop.txt");
      el.loop = true;
      el.addEventListener("error", () => { this.trackFailed = true; this.trackOn = false; });
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      this.ctx.createMediaElementSource(el).connect(gain).connect(this.master);
      this.track = { el, gain };
    }
    const { el, gain } = this.track, now = this.ctx.currentTime;
    clearTimeout(this.trackPause);
    if (on) {
      el.play().then(() => {
        this.trackOn = true; // from here the chiptune is silent and the beat is heard from the track
        gain.gain.setTargetAtTime(0.75, this.ctx.currentTime, 2.4); // a slow rise, in step with the dark lifting
      }, () => { this.trackFailed = true; });
    } else {
      this.trackOn = false;
      gain.gain.setTargetAtTime(0, now, 0.9);
      this.trackPause = setTimeout(() => el.pause(), 4000);
    }
  }

  // 143 bpm: "timing matching to goa/psy/prograssivetrance/psychedelic ~143to145 bpm"
  stepChip(step) {
    if (!this.chip) return void (this.chipRunning = false);
    const sixteenth = 60 / 143 / 4, now = this.ctx.currentTime;
    if (!this.chipRunning || this.chipNext < now - 0.5) this.chipNext = now + 0.06, this.chipZero = this.chipNext - step * sixteenth;
    this.chipRunning = true;
    if (this.ctx.state === "running" && !this.trackOn) { // while his own music plays the chiptune only keeps time
      const at = this.chipNext, bar = Math.floor(step / 16) % 4;
      const root = 220 * semis([0, -4, 3, -2][bar]), arp = [0, 4, 7, 12, 7, 4, 16, 12][step % 8];
      const blip = (frequency, type, level, length) => {
        const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(level, at);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
        osc.connect(gain);
        gain.connect(this.master);
        gain.connect(this.reverb);
        osc.start(at);
        osc.stop(at + length + 0.02);
      };
      blip(root * semis(arp), "square", 0.035, sixteenth * 1.6);
      if (step % 4 === 2) blip(root / 2, "triangle", 0.12, sixteenth * 2);
      if (step % 4 === 0) {
        const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
        osc.frequency.setValueAtTime(110, at);
        osc.frequency.exponentialRampToValueAtTime(42, at + 0.16);
        gain.gain.setValueAtTime(0.32, at);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.24);
        osc.connect(gain).connect(this.master);
        osc.start(at);
        osc.stop(at + 0.3);
        this.hits.push({ at, strength: step % 16 === 0 ? 1 : 0.7 });
      }
    }
    this.chipNext += sixteenth;
    setTimeout(() => this.stepChip(step + 1), Math.max(0, (this.chipNext - this.ctx.currentTime - 0.05) * 1000));
  }

  // which sixteenth the chiptune is on right now (fractional), or -1 when it is not playing
  chipClock() {
    return this.chip && this.chipRunning ? (this.ctx.currentTime - this.chipZero) / (60 / 143 / 4) : -1;
  }

  // step back while something else has the stage (a Flash piece with its own sound)
  duck(on) {
    if (!this.ctx) return;
    this.ducked = on;
    this.master.gain.setTargetAtTime(on ? 0 : this.level, this.ctx.currentTime, 0.3);
  }

  // MEOW. His own samples: the arrays "meow2".."meow5" from MEOWing_stm_TEST.txt, which he played
  // through a transistor and a piezo ("get sound without soundmodule in (strange cracking) quality").
  meow(level = 0.5, pan = 0, rate = 0) {
    if (!this.ctx || this.ctx.state !== "running" || this.silentMeow) return;
    this.meows ??= [1, 2, 3, 4].map((n) => fetch(`/marderchen/meow${n}.wav`).then((res) => res.arrayBuffer()).then((data) => this.ctx.decodeAudioData(data)).catch(() => null));
    this.meows[Math.floor(Math.random() * this.meows.length)].then((buffer) => {
      if (!buffer) return;
      const source = this.ctx.createBufferSource(), gain = this.ctx.createGain(), panner = this.ctx.createStereoPanner();
      source.buffer = buffer;
      source.playbackRate.value = rate || 0.85 + Math.random() * 0.5;
      gain.gain.value = level;
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      source.connect(gain).connect(panner);
      panner.connect(this.master);
      panner.connect(this.reverb);
      source.start();
    });
  }

  // a relay switching: he loved that sound and built clocks and a "knattertron" around it
  relay(level = 0.25) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime, source = this.ctx.createBufferSource(), band = this.ctx.createBiquadFilter(), gain = this.ctx.createGain();
    source.buffer = this.noise;
    band.type = "bandpass";
    band.frequency.value = 2600;
    band.Q.value = 1.2;
    gain.gain.setValueAtTime(level, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
    source.connect(band).connect(gain).connect(this.master);
    source.start(now, Math.random());
    source.stop(now + 0.05);
    this.ping(180, level * 0.5, 0.05, now);
  }

  entityVoice(level, pan) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.voiceGain.gain.setTargetAtTime(level * 0.11, now, 0.5);
    this.voicePan.pan.setTargetAtTime(pan, now, 0.15);
  }

  // something leaving quickly: a falling breath of noise over a low thump
  sting() {
    if (!this.ctx) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const source = ctx.createBufferSource(), band = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = this.noise;
    band.type = "bandpass";
    band.Q.value = 2;
    band.frequency.setValueAtTime(2400, now);
    band.frequency.exponentialRampToValueAtTime(140, now + 0.9);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.5, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
    source.connect(band).connect(gain);
    gain.connect(this.master);
    gain.connect(this.reverb);
    source.start(now);
    source.stop(now + 1.2);
    this.ping(48, 0.5, 1.6, now);
  }

  // flying into something: a knock, deeper and louder the harder
  bump(strength) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const now = this.ctx.currentTime, osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(150 - strength * 70, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.2);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25 + strength * 0.45, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    osc.connect(gain).connect(this.master);
    gain.connect(this.reverb);
    osc.start(now);
    osc.stop(now + 0.35);
  }

  // everything stops; then one note
  hush(seconds) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0.004, now, 0.25);
    this.master.gain.setTargetAtTime(this.level, now + seconds, 1.2);
    this.ping(this.sound.root * 8, 0.12, 7, now + seconds);
  }

  scheduleShimmer() {
    setTimeout(() => {
      if (this.ctx.state === "running" && Math.random() < this.sound.shimmer) {
        const scale = MODES[this.sound.mode];
        const note = scale[Math.floor(Math.random() * scale.length)];
        this.ping(this.sound.root * (Math.random() < 0.5 ? 8 : 16) * semis(note), 0.025, 5);
      }
      this.scheduleShimmer();
    }, 1200 + Math.random() * 3500);
  }

  // ---- the zone ----
  // Its music is the stage's own files when it has any: each file one layer, all started together,
  // brought in one by one as lines are cleared. Without files a small score of ours plays at the
  // stage's tempo, its parts arriving the same way. All of it runs through one low-pass that closes
  // while time is stopped. The pieces' own sounds are in the stage's key and land on its beat.

  zoneBus() {
    if (this.zone) return this.zone;
    const ctx = this.ctx, gain = ctx.createGain(), build = ctx.createBiquadFilter(), swell = ctx.createGain(), lowpass = ctx.createBiquadFilter(), sfx = ctx.createGain();
    // the build: a stage begins with its music held back, darker and quieter, and opens up as you play through it
    build.type = "lowpass";
    build.frequency.value = 4000;
    build.Q.value = 0.7;
    swell.gain.value = 0.8;
    lowpass.type = "lowpass";
    lowpass.frequency.value = 20000;
    lowpass.Q.value = 0.9;
    gain.gain.value = 0;
    gain.connect(build).connect(swell).connect(lowpass).connect(this.master);
    sfx.gain.value = 1;
    sfx.connect(this.master);
    sfx.connect(this.reverb);
    return (this.zone = { gain, build, swell, lowpass, sfx, stems: [], layer: 0, intensity: 0.35, on: false, stage: null, synth: false, heard: false });
  }

  // in the zone or not: the drone steps back and the music fades in as the dark lifts
  setZone(on) {
    if (!this.ctx) return;
    const zone = this.zoneBus(), now = this.ctx.currentTime;
    zone.on = on;
    this.droneLevel.gain.setTargetAtTime(on ? 0.12 : 1, now, 1.5);
    zone.gain.gain.setTargetAtTime(on ? 0.7 : 0, now, on ? 2.4 : 0.9);
    clearTimeout(zone.pause);
    if (on) {
      if (zone.stems.length) Promise.all(zone.stems.map((stem) => stem.el.play())).then(() => { zone.heard = true; }, () => {});
      if (zone.synth && !zone.synthRunning) this.stepZone(0);
    } else {
      zone.heard = false;
      zone.pause = setTimeout(() => { for (const stem of zone.stems) stem.el.pause(); }, 4000);
    }
  }

  // The stage's song, from its beginning. Whatever was playing fades out under it, even when it is the
  // same song (restart: a new run starts it over).
  setZoneStage(stage, restart = false) {
    if (!this.ctx) return;
    const zone = this.zoneBus(), now = this.ctx.currentTime;
    if (zone.stage === stage && !restart) return;
    zone.stage = stage;
    for (const stem of zone.stems) {
      // the old song fades out under the new one
      stem.gain.gain.setTargetAtTime(0, now, 1.3);
      setTimeout(() => { stem.el.pause(); stem.el.removeAttribute("src"); stem.gain.disconnect(); }, 7000);
    }
    zone.stems = [];
    zone.heard = false;
    const files = stage.music ?? [];
    zone.synth = !files.length;
    if (zone.synth) {
      if (zone.on && !zone.synthRunning) this.stepZone(0);
      return;
    }
    let failed = 0;
    zone.stems = files.map((url, i) => {
      const el = new Audio(url), gain = this.ctx.createGain();
      el.loop = true;
      el.preload = "auto";
      gain.gain.value = 0;
      this.ctx.createMediaElementSource(el).connect(gain).connect(zone.gain);
      el.addEventListener("error", () => {
        // none of the stage's files would play: our own score takes over
        if (++failed === files.length && zone.stage === stage) {
          zone.stems = [];
          zone.synth = true;
          zone.heard = false;
          if (zone.on && !zone.synthRunning) this.stepZone(0);
        }
      });
      return { el, gain, index: i };
    });
    if (zone.on) Promise.all(zone.stems.map((s) => s.el.play())).then(() => { zone.heard = true; }, () => {});
    this.setZoneIntensity(zone.intensity, zone.layer > 0);
    // the files drift apart a little as they play; every few seconds the others are put back on the first
    clearInterval(zone.sync);
    zone.sync = setInterval(() => {
      const [lead, ...rest] = zone.stems;
      if (!lead || lead.el.paused) return;
      for (const stem of rest) if (Math.abs(stem.el.currentTime - lead.el.currentTime) > 0.05) stem.el.currentTime = lead.el.currentTime;
    }, 4000);
  }

  // How far into its stage the music is, 0..1. It opens up as this grows: the filter lifts, it gets
  // louder, and a stage made of several files brings them in one by one (the first always plays).
  setZoneIntensity(intensity, playing) {
    if (!this.ctx) return;
    const zone = this.zoneBus(), now = this.ctx.currentTime;
    zone.intensity = intensity;
    zone.build.frequency.setTargetAtTime(1800 * (19000 / 1800) ** (intensity ** 0.7), now, 1.6); // clearly held back at first, open well before the end
    zone.swell.gain.setTargetAtTime(0.7 + 0.3 * intensity, now, 1.6);
    zone.layer = playing ? 1 + Math.min(3, Math.floor(intensity * 4)) : 0; // our own score's parts
    const stems = zone.stems.length, layer = Math.floor(intensity * stems);
    for (const stem of zone.stems) stem.gain.gain.setTargetAtTime(stem.index <= layer ? 1 : 0, now, 1.3);
  }

  // time stopped: the music goes under water
  zoneStill(on) {
    if (!this.ctx) return;
    const { lowpass } = this.zoneBus();
    lowpass.frequency.setTargetAtTime(on ? 420 : 20000, this.ctx.currentTime, on ? 0.25 : 0.6);
  }

  zoneTempo() {
    return this.zone?.stage?.bpm || 0;
  }

  // where the zone's music is, in beats, or -1 when its beat is not known
  zoneBeat() {
    const zone = this.zone, bpm = this.zoneTempo();
    if (!zone?.on || !bpm) return -1;
    if (zone.synth) return zone.synthRunning ? (this.ctx.currentTime - zone.zero) * (bpm / 60) : -1;
    const lead = zone.stems[0]?.el;
    return lead && !lead.paused ? (lead.currentTime - (zone.stage.offset ?? 0)) * (bpm / 60) : -1;
  }

  // the next sixteenth of the music, so a sound played now falls in time with it
  onBeat(grid = 4) {
    const now = this.ctx.currentTime, beat = this.zoneBeat();
    if (beat < 0) return now;
    const wait = ((Math.ceil(beat * grid) - beat * grid) / grid) * (60 / this.zoneTempo());
    return now + (wait < 0.012 ? 0 : wait);
  }

  // a note of the stage's scale: degree 0 is the root, counting up through the scale and its octaves
  zoneNote(degree, octave = 2) {
    const stage = this.zone?.stage, root = stage?.root || 55;
    const steps = [...new Set((MODES[stage?.mode] ?? MODES.pentatonic).map((s) => s % 12))].sort((a, b) => a - b), n = steps.length;
    return root * 2 ** octave * semis(steps[((degree % n) + n) % n] + 12 * Math.floor(degree / n));
  }

  tone(frequency, level, decay, at, type = "sine", out = this.zoneBus().sfx) {
    const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    osc.connect(gain).connect(out);
    osc.start(at);
    osc.stop(at + decay + 0.05);
  }

  thump(level, at, from = 120, to = 40) {
    const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + 0.18);
    gain.gain.setValueAtTime(level, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
    osc.connect(gain).connect(this.zoneBus().sfx);
    osc.start(at);
    osc.stop(at + 0.35);
  }

  swell(level, at, seconds, from, to) {
    const source = this.ctx.createBufferSource(), band = this.ctx.createBiquadFilter(), gain = this.ctx.createGain();
    source.buffer = this.noise;
    band.type = "bandpass";
    band.Q.value = 1.4;
    band.frequency.setValueAtTime(from, at);
    band.frequency.exponentialRampToValueAtTime(to, at + seconds);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + seconds * 0.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    source.connect(band).connect(gain).connect(this.zoneBus().sfx);
    source.start(at, Math.random());
    source.stop(at + seconds + 0.05);
  }

  // Each stage has its own instrument for what the pieces do. All are made here, from oscillators.
  voice(name, frequency, level, decay, at) {
    const out = this.zoneBus().sfx, ctx = this.ctx;
    const partial = (ratio, amount, length, type = "sine") => this.tone(frequency * ratio, level * amount, decay * length, at, type, out);
    switch (name) {
      case "drop": { // a water drop: a short sine that falls in pitch
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.frequency.setValueAtTime(frequency * 1.6, at);
        osc.frequency.exponentialRampToValueAtTime(frequency, at + 0.06);
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(level, at + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
        osc.connect(gain).connect(out);
        osc.start(at);
        osc.stop(at + decay + 0.05);
        return partial(2.01, 0.25, 0.4);
      }
      case "marimba": partial(1, 1, 0.6); return partial(3.99, 0.3, 0.15);
      case "chime": partial(1, 1, 1.4); partial(3.01, 0.25, 0.8); return partial(5.4, 0.08, 0.5);
      case "pluck": partial(1, 1, 0.7, "triangle"); return partial(2, 0.3, 0.35, "sawtooth");
      case "harp": partial(1, 0.8, 1.2, "triangle"); partial(2, 0.35, 0.8); return partial(3, 0.12, 0.5);
      default: partial(1, 1, 1); return partial(2.76, 0.35, 0.5); // a bell
    }
  }

  // what the pieces sound like, in the stage's key and on its beat: moving plays the column you are
  // in, low on the left, high on the right; turning goes up clockwise and down the other way
  zoneSound(kind, value = 0) {
    if (!this.ctx || this.ctx.state !== "running" || this.muted) return;
    const now = this.ctx.currentTime, note = (d, o) => this.zoneNote(d, o), voice = this.zone?.stage?.voice ?? "bell";
    const play = (degree, octave, level, decay, at = this.onBeat(4)) => this.voice(voice, note(degree, octave), level, decay, at);
    switch (kind) {
      case "move": return play(value, 3, 0.16, 0.22);
      case "rotate": return play(value > 0 ? 7 : 5, 4, 0.15, 0.5);
      case "hold": play(4, 3, 0.13, 0.4); return play(7, 3, 0.1, 0.4, this.onBeat(4) + 0.07);
      case "lock": return play(value, 2, 0.17, 0.45);
      case "drop": this.thump(0.5, now); return this.tone(note(0, 1), 0.2, 0.5, now);
      case "clear": {
        // a chord, spread out on the beat: one note more for every line
        const at = this.onBeat(4), step = 60 / (this.zoneTempo() || 120) / 4;
        for (let i = 0; i <= value; i++) play(i * 2, 3, 0.14, 1.8, at + i * step);
        if (value >= 4) {
          this.swell(0.3, now, 1.2, 300, 6000);
          this.thump(0.6, at, 90, 30);
          for (let i = 0; i < 4; i++) play(i * 2, 5, 0.07, 2.5, at + (i + 5) * step);
        }
        return;
      }
      case "spin": this.swell(0.22, now, 0.5, 900, 4000); return play(5, 4, 0.14, 0.9);
      case "zone": this.swell(0.35, now, 1.4, 5000, 200); return this.thump(0.6, now, 70, 25);
      case "zoneLines": return play(value + 7, 4, 0.13, 1.2);
      case "zoneEnd": {
        this.thump(0.8, now, 80, 22);
        this.swell(0.4, now, 2.2, 200, 8000);
        for (let i = 0; i < 6; i++) play(i * 2, 2 + (i >> 1), 0.14, 3.5, now + i * 0.07);
        return;
      }
      case "level": [0, 2, 4, 7].forEach((d, i) => play(d, 4, 0.09, 1.4, this.onBeat(2) + i * 0.09)); return;
      case "stage": [0, 4, 7, 11, 14].forEach((d, i) => play(d, 3, 0.1, 2.8, now + i * 0.16)); return;
      case "journey": [0, 2, 4, 7, 9, 11, 14].forEach((d, i) => play(d, 3 + (i > 3), 0.12, 4, now + i * 0.2)); return;
      case "over": [7, 4, 2, 0].forEach((d, i) => play(d, 2, 0.14, 2.2, now + i * 0.35)); return;
    }
  }

  // our own score for a stage without music: a pad from the start, then a kick and a bass, an
  // arpeggio, hats and a high line, each arriving with the next layer
  stepZone(step) {
    const zone = this.zone;
    if (!zone?.on || !zone.synth) return void (zone && (zone.synthRunning = false));
    const bpm = this.zoneTempo() || 112, sixteenth = 60 / bpm / 4, now = this.ctx.currentTime;
    if (!zone.synthRunning || zone.next < now - 0.5) zone.next = now + 0.06;
    if (!zone.synthRunning || zone.next < now - 0.5 || zone.bpm !== bpm) zone.zero = zone.next - step * sixteenth, zone.bpm = bpm; // a new stage may have a new tempo
    zone.synthRunning = true;
    if (this.ctx.state === "running") {
      const at = zone.next, bar = Math.floor(step / 16), chord = [0, 5, 3, 4][bar % 4], layer = zone.layer;
      const out = zone.gain, note = (d, o) => this.zoneNote(d, o);
      if (step % 16 === 0) for (const [d, type] of [[0, "sine"], [2, "triangle"], [4, "sine"]]) this.tone(note(chord + d, 2), 0.05, sixteenth * 30, at, type, out);
      if (layer >= 1 && step % 4 === 0) {
        const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
        osc.frequency.setValueAtTime(100, at);
        osc.frequency.exponentialRampToValueAtTime(38, at + 0.16);
        gain.gain.setValueAtTime(0.3, at);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.26);
        osc.connect(gain).connect(out);
        osc.start(at);
        osc.stop(at + 0.3);
        this.hits.push({ at, strength: step % 16 === 0 ? 1 : 0.7 });
      }
      if (layer >= 1 && step % 8 === 6) this.tone(note(chord, 0), 0.16, sixteenth * 3, at, "triangle", out);
      if (layer >= 2) this.tone(note(chord + [0, 2, 4, 7, 4, 2, 9, 7][step % 8], 3), 0.025, sixteenth * 1.8, at, "triangle", out);
      if (layer >= 3 && step % 4 === 2) {
        const source = this.ctx.createBufferSource(), band = this.ctx.createBiquadFilter(), gain = this.ctx.createGain();
        source.buffer = this.noise;
        band.type = "highpass";
        band.frequency.value = 7000;
        gain.gain.setValueAtTime(0.06, at);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
        source.connect(band).connect(gain).connect(out);
        source.start(at, Math.random());
        source.stop(at + 0.06);
      }
      if (layer >= 4 && step % 32 < 24 && [0, 3, 6, 10, 12, 14].includes(step % 16)) this.tone(note(chord + [7, 9, 8, 7, 4, 5][step % 6], 4), 0.03, sixteenth * 5, at, "sine", out);
    }
    zone.next += sixteenth;
    setTimeout(() => this.stepZone(step + 1), Math.max(0, (zone.next - this.ctx.currentTime - 0.05) * 1000));
  }

  // how loud everything is: the player's volume, unless muted
  get level() {
    return this.muted ? 0 : 0.55 * this.volume ** 2; // squared, so the slider feels even from quiet to loud
  }

  setVolume(volume) {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.ctx && !this.ducked) this.master.gain.setTargetAtTime(this.level, this.ctx.currentTime, 0.05);
    return this.volume;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.level, this.ctx.currentTime, 0.2);
    return this.muted;
  }
}
