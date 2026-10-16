import { settingsStore } from "../settings";

/**
 * Synthesized audio via Web Audio: no files to load or fail, no licensing.
 * Graph: sources -> sfx bus / music bus -> master -> speakers.
 * The context is created on the first user gesture to respect autoplay rules.
 */
class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readyListeners = new Set<() => void>();

  constructor() {
    settingsStore.subscribe(() => this.applyVolumes());
    // Silence everything while the app is in the background (e.g. Android home screen).
    document.addEventListener("visibilitychange", () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend().catch(() => undefined);
      else void this.ctx.resume().catch(() => undefined);
    });
  }

  get context(): AudioContext | null {
    return this.ctx && this.ctx.state === "running" ? this.ctx : null;
  }

  get music(): GainNode | null {
    return this.musicBus;
  }

  get noiseBuffer(): AudioBuffer | null {
    return this.noise;
  }

  /** Called once the context runs (after the first gesture). */
  onReady(listener: () => void): () => void {
    this.readyListeners.add(listener);
    if (this.context) listener();
    return () => {
      this.readyListeners.delete(listener);
    };
  }

  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        this.master.connect(this.ctx.destination);
        this.sfxBus = this.ctx.createGain();
        this.musicBus = this.ctx.createGain();
        this.sfxBus.connect(this.master);
        this.musicBus.connect(this.master);
        this.applyVolumes();
        const length = Math.floor(this.ctx.sampleRate * 0.4);
        this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      }
      const notify = () => this.readyListeners.forEach((l) => l());
      if (this.ctx.state === "suspended") void this.ctx.resume().then(notify, () => undefined);
      else notify();
    } catch {
      this.ctx = null;
    }
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.sfxBus || !this.musicBus) return;
    const { sfxVolume, musicVolume } = settingsStore.get();
    const t = this.ctx.currentTime;
    // Perceptual curve: squares feel more even on a slider.
    this.sfxBus.gain.setTargetAtTime(sfxVolume * sfxVolume * 0.6, t, 0.05);
    this.musicBus.gain.setTargetAtTime(musicVolume * musicVolume * 0.5, t, 0.05);
  }

  private get ready(): AudioContext | null {
    if (settingsStore.get().sfxVolume <= 0 || !this.sfxBus) return null;
    return this.context;
  }

  private tone(freq: number, duration: number, type: OscillatorType, gain: number, slideTo?: number, delay = 0): void {
    const ctx = this.ready;
    if (!ctx || !this.sfxBus) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(env).connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  private thud(duration: number, gain: number, cutoff: number): void {
    const ctx = this.ready;
    if (!ctx || !this.sfxBus || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(env).connect(this.sfxBus);
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
