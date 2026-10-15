import { audio } from "./AudioManager";

/**
 * Original procedural background music (Web Audio, no files): a Japanese-flavoured
 * pentatonic (yo scale) koto/shamisen line over taiko drums.
 * - "menu": relaxed, 92 BPM.
 * - "bout": driving, 136 BPM, more drums.
 * Notes are scheduled slightly ahead with a small lookahead timer.
 */
export type MusicMode = "off" | "menu" | "bout";

// Yo scale on D: D E G A B (MIDI), two octaves.
const SCALE = [50, 52, 55, 57, 59, 62, 64, 67, 69, 71, 74, 76];
const midiHz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

interface Pattern {
  bpm: number;
  /** Steps per beat. */
  division: number;
  /** Scale indexes, -1 = rest. */
  melody: number[];
  bass: number[];
  /** 0 = none, 1 = soft, 2 = accent. */
  taiko: number[];
  shaker: number[];
}

const MENU: Pattern = {
  bpm: 92,
  division: 2,
  melody: [7, -1, 8, 7, 5, -1, 6, -1, 7, -1, 9, 8, 7, -1, -1, -1, 5, -1, 6, 5, 3, -1, 4, -1, 5, -1, 7, -1, 6, 5, -1, -1],
  bass: [0, -1, -1, -1, 0, -1, -1, -1, 3, -1, -1, -1, 3, -1, -1, -1, 1, -1, -1, -1, 1, -1, -1, -1, 3, -1, -1, -1, 0, -1, -1, -1],
  taiko: [2, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 1, 0, 1, 0, 2, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 1, 0, 1, 1],
  shaker: [],
};

const BOUT: Pattern = {
  bpm: 136,
  division: 4,
  melody: [
    7, -1, 9, -1, 10, -1, 9, 7, 8, -1, 7, -1, 5, -1, 6, -1,
    7, -1, 9, -1, 10, -1, 11, -1, 10, 9, 8, -1, 7, -1, -1, -1,
    5, -1, 7, -1, 8, -1, 7, 5, 6, -1, 5, -1, 3, -1, 4, -1,
    5, -1, 7, -1, 9, -1, 8, -1, 7, -1, 6, 5, 7, -1, -1, -1,
  ],
  bass: [
    0, -1, 0, -1, 0, -1, 0, 2, 3, -1, 3, -1, 3, -1, 3, 4,
    0, -1, 0, -1, 0, -1, 0, 2, 3, -1, 3, -1, 2, -1, 1, -1,
    1, -1, 1, -1, 1, -1, 1, 3, 3, -1, 3, -1, 3, -1, 3, 4,
    0, -1, 0, -1, 2, -1, 2, -1, 3, -1, 3, -1, 0, -1, 0, -1,
  ],
  taiko: [
    2, 0, 0, 1, 0, 0, 1, 0, 2, 0, 0, 1, 0, 0, 1, 1,
    2, 0, 0, 1, 0, 0, 1, 0, 2, 0, 1, 0, 2, 1, 1, 1,
  ],
  shaker: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1],
};

class Music {
  private mode: MusicMode = "off";
  private timer = 0;
  private step = 0;
  private nextTime = 0;
  private offReady: (() => void) | null = null;

  setMode(mode: MusicMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.step = 0;
    window.clearInterval(this.timer);
    this.timer = 0;
    if (mode === "off") return;
    const start = () => {
      const ctx = audio.context;
      if (!ctx || this.mode !== mode || this.timer) return;
      this.nextTime = ctx.currentTime + 0.1;
      this.timer = window.setInterval(() => this.schedule(), 30);
    };
    this.offReady?.();
    this.offReady = audio.onReady(start);
  }

  private schedule(): void {
    const ctx = audio.context;
    const bus = audio.music;
    if (!ctx || !bus || this.mode === "off") return;
    const pattern = this.mode === "bout" ? BOUT : MENU;
    const stepDur = 60 / pattern.bpm / pattern.division;
    while (this.nextTime < ctx.currentTime + 0.15) {
      const i = this.step;
      const at = this.nextTime;
      const m = pattern.melody[i % pattern.melody.length]!;
      if (m >= 0) this.pluck(ctx, bus, midiHz(SCALE[m]!), at, stepDur * 2.2, 0.16);
      const b = pattern.bass[i % pattern.bass.length]!;
      if (b >= 0) this.bassNote(ctx, bus, midiHz(SCALE[b]! - 12), at, stepDur * 1.8);
      const t = pattern.taiko[i % pattern.taiko.length]!;
      if (t > 0) this.taiko(ctx, bus, at, t === 2 ? 0.55 : 0.3);
      if (pattern.shaker.length && pattern.shaker[i % pattern.shaker.length]) this.shaker(ctx, bus, at);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  /** Koto/shamisen-like pluck: bright saw through a closing low-pass. */
  private pluck(ctx: AudioContext, bus: GainNode, freq: number, at: number, length: number, gain: number): void {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(freq, at);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(freq * 6, at);
    filter.frequency.exponentialRampToValueAtTime(freq * 1.2, at + length);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(filter).connect(env).connect(bus);
    osc.start(at);
    osc.stop(at + length + 0.05);
  }

  private bassNote(ctx: AudioContext, bus: GainNode, freq: number, at: number, length: number): void {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, at);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(0.22, at + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(env).connect(bus);
    osc.start(at);
    osc.stop(at + length + 0.05);
  }

  /** Taiko: low sine with a fast pitch drop plus a soft noise skin hit. */
  private taiko(ctx: AudioContext, bus: GainNode, at: number, gain: number): void {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, at);
    osc.frequency.exponentialRampToValueAtTime(48, at + 0.25);
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
    osc.connect(env).connect(bus);
    osc.start(at);
    osc.stop(at + 0.4);
    const noise = audio.noiseBuffer;
    if (noise) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 900;
      const nEnv = ctx.createGain();
      nEnv.gain.setValueAtTime(gain * 0.35, at);
      nEnv.gain.exponentialRampToValueAtTime(0.0001, at + 0.08);
      src.connect(filter).connect(nEnv).connect(bus);
      src.start(at);
      src.stop(at + 0.1);
    }
  }

  private shaker(ctx: AudioContext, bus: GainNode, at: number): void {
    const noise = audio.noiseBuffer;
    if (!noise) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 6000;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.06, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    src.connect(filter).connect(env).connect(bus);
    src.start(at);
    src.stop(at + 0.06);
  }
}

export const music = new Music();
