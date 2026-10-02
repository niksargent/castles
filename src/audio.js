// Procedural soundscape (no audio files): wind that swells with height and gusts, water lapping
// near the shore, footsteps that know grass from stone from water, and a slow harmonic drone
// whose chord shifts with the photograph you're standing in.
export class Soundscape {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  start() {
    if (this.ctx) return;
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    this.master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 4);

    // shared noise buffers
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.15; // pink-ish
    }
    this.noise = buf;
    const white = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const wd = white.getChannelData(0);
    for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;
    this.white = white;

    // wind: two band-passed noise layers
    this.wind = [];
    for (const [f, q] of [[380, 0.8], [900, 1.4]]) {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      src.playbackRate.value = 0.7 + Math.random() * 0.2;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(bp).connect(g).connect(this.master);
      src.start(0, Math.random() * 3);
      this.wind.push({ bp, g, f });
    }
    // water lapping
    {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(lp).connect(g).connect(this.master);
      src.start();
      this.water = { lp, g };
    }
    // drone: three voices per chord, retuned smoothly
    this.droneOut = ctx.createGain(); this.droneOut.gain.value = 0.0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.3;
    this.droneOut.connect(lp).connect(this.master);
    this.droneLP = lp;
    this.voices = [];
    for (let i = 0; i < 4; i++) {
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
      o1.type = 'sine'; o2.type = 'triangle';
      o2.detune.value = 7;
      const g = ctx.createGain(); g.gain.value = 0.05;
      o1.connect(g); o2.connect(g); g.connect(this.droneOut);
      o1.start(); o2.start();
      this.voices.push({ o1, o2, g });
    }
    this.droneOut.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 8);
    this.setChord([0, 7, 12, 16], 0);
    this.t = 0;
    this.gust = 0;
  }

  setChord(semis, glide = 6) {
    if (!this.ctx) return;
    const base = 65.41; // C2
    const now = this.ctx.currentTime;
    semis.forEach((s, i) => {
      const f = base * Math.pow(2, s / 12) * (i === 0 ? 1 : 2);
      const v = this.voices[i];
      v.o1.frequency.cancelScheduledValues(now);
      v.o2.frequency.cancelScheduledValues(now);
      v.o1.frequency.setTargetAtTime(f, now, glide / 3);
      v.o2.frequency.setTargetAtTime(f * 1.001, now, glide / 3);
    });
  }

  step(surface, sprint) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, now = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.white;
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    let dur = 0.12, vol = 0.12, freq = 1400, type = 'bandpass';
    if (surface === 'stone') { freq = 2600; vol = 0.09; dur = 0.07; }
    if (surface === 'water') { freq = 700; vol = 0.16; dur = 0.32; type = 'lowpass'; }
    if (sprint) vol *= 1.3;
    f.type = type; f.frequency.value = freq * (0.85 + Math.random() * 0.3); f.Q.value = 0.9;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(now, Math.random() * 0.5, dur + 0.05);
  }

  update(dt, { height, shore, zoneMood, speed }) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.t += dt;
    this.gust += (Math.random() - 0.5) * dt * 0.8;
    this.gust *= 0.995;
    const g = 0.5 + 0.5 * Math.sin(this.t * 0.13) * Math.sin(this.t * 0.051 + 1) + this.gust;
    const alt = Math.min(1, Math.max(0, height / 60));
    this.wind.forEach((w, i) => {
      w.g.gain.setTargetAtTime((0.05 + alt * 0.12 + Math.max(0, g) * 0.08) * (i ? 0.5 : 1), now, 0.5);
      w.bp.frequency.setTargetAtTime(w.f * (0.8 + g * 0.5 + alt * 0.3), now, 0.8);
    });
    const lap = 0.5 + 0.5 * Math.sin(this.t * 1.7) * Math.sin(this.t * 0.63);
    this.water.g.gain.setTargetAtTime(shore * (0.05 + lap * 0.09), now, 0.3);
    this.water.lp.frequency.setTargetAtTime(350 + lap * 500, now, 0.3);
    if (zoneMood && zoneMood !== this.mood) {
      this.mood = zoneMood;
      this.setChord(zoneMood);
    }
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, now, 0.4);
  }
}

// chords per photograph mood (semitones over C)
export const MOODS = {
  ed_heather: [0, 7, 16, 19], ed_silver: [-3, 4, 9, 12], ed_bridge: [-5, 2, 7, 10], ed_storm: [-2, 5, 10, 14],
  ed_verdigris: [2, 9, 14, 17], ed_lichen: [-3, 4, 7, 12], ed_gold: [0, 7, 11, 16], dunvegan: [-4, 3, 8, 15],
  edin_summer: [5, 12, 17, 21], edin_night: [-7, 0, 5, 8], edin_ember: [-3, 4, 7, 10], edin_canvas: [0, 7, 14, 15],
  edin_kirkyard: [3, 10, 15, 19],
};
