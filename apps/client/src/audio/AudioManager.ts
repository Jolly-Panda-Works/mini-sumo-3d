import { settingsStore } from "../settings";

/**
 * Synthesized sound effects via Web Audio: no audio files to load or fail.
 * The context is created on the first user gesture to respect autoplay rules.
 */
class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.45;
        this.master.connect(this.ctx.destination);
        const length = Math.floor(this.ctx.sampleRate * 0.4);
        this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => undefined);
    } catch {
      this.ctx = null;
    }
  }

  private get ready(): AudioContext | null {
    if (!settingsStore.get().sound || !this.ctx || !this.master || this.ctx.state !== "running") return null;
    return this.ctx;
  }

  private tone(freq: number, duration: number, type: OscillatorType, gain: number, slideTo?: number, delay = 0): void {
    const ctx = this.ready;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(env).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  private thud(duration: number, gain: number, cutoff: number): void {
    const ctx = this.ready;
    if (!ctx || !this.master || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(env).connect(this.master);
    src.start(t);
    src.stop(t + duration + 0.05);
  }

  impact(strength: number): void {
    const s = Math.min(1, strength / 12);
    this.thud(0.18, 0.25 + s * 0.5, 500 + s * 900);
    this.tone(140 - s * 40, 0.18, "sine", 0.35 + s * 0.3, 55);
  }

  dash(): void {
    this.tone(260, 0.16, "triangle", 0.22, 720);
    this.thud(0.12, 0.12, 2400);
  }

  eliminated(): void {
    this.tone(620, 0.55, "square", 0.12, 90);
  }

  countdown(): void {
    this.tone(660, 0.12, "square", 0.14);
  }

  go(): void {
    this.tone(990, 0.3, "square", 0.16);
    this.tone(1320, 0.3, "triangle", 0.1, undefined, 0.05);
  }

  victory(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, "triangle", 0.2, undefined, i * 0.11));
  }

  roundEnd(): void {
    this.tone(392, 0.25, "triangle", 0.18);
    this.tone(330, 0.35, "triangle", 0.16, undefined, 0.18);
  }

  click(): void {
    this.tone(880, 0.05, "sine", 0.08);
  }
}

export const audio = new AudioManager();
