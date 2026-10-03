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
    this.master.gain.linearRampToValueAtTime(0.55, now + 4);
    const limiter = ctx.createDynamicsCompressor();
    this.master.connect(limiter).connect(ctx.destination);

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
    this.windBand.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(this.windBand).connect(this.windGain).connect(this.master);
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
    this.windGain.gain.setTargetAtTime(Math.min(speed / 320, 1) ** 1.5 * 0.22, now, 0.3);
    this.windBand.frequency.setTargetAtTime(250 + speed * 3, now, 0.3);
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
    if ((this.mic || this.trackOn) && raw.bass > this.averages.bass + 0.035 && out.beat < 0.4) out.beat = 1;
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
    this.master.gain.setTargetAtTime(on || this.muted ? 0 : 0.55, this.ctx.currentTime, 0.3);
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

  // everything stops; then one note
  hush(seconds) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0.004, now, 0.25);
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, now + seconds, 1.2);
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

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.ctx.currentTime, 0.2);
    return this.muted;
  }
}
