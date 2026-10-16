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

  /** Referee's whistle: the bout starts. */
  go(): void {
    this.whistle();
  }

  whistle(): void {
    const ctx = this.ready;
    if (!ctx || !this.sfxBus) return;
    const t = ctx.currentTime;
    const dur = 0.62;
    // Pea whistle: a bright tone warbled fast by the rolling pea, plus a little breath.
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(2850, t);
    osc.frequency.linearRampToValueAtTime(3050, t + 0.08);
    const trill = ctx.createOscillator();
    trill.frequency.value = 34;
    const trillDepth = ctx.createGain();
    trillDepth.gain.value = 140;
    trill.connect(trillDepth).connect(osc.frequency);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.32, t + 0.03);
    env.gain.setValueAtTime(0.32, t + dur - 0.12);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(this.sfxBus);
    osc.start(t);
    trill.start(t);
    osc.stop(t + dur + 0.05);
    trill.stop(t + dur + 0.05);
    this.noiseBurst(t, dur, 3200, 0.08, "bandpass");
  }

  /** Crowd cheering (you pushed someone out). */
  crowdCheer(): void {
    const ctx = this.ready;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.crowd(t, 1.8, 900, 1500, 0.32);
    // A few voices whooping on top.
    for (let i = 0; i < 6; i++) {
      const start = t + 0.1 + Math.random() * 0.6;
      const f = 420 + Math.random() * 380;
      this.voice(start, 0.35 + Math.random() * 0.3, f, f * (1.25 + Math.random() * 0.3), 0.05);
    }
  }

  /** Crowd groaning "aww" (you were pushed out). */
  crowdAww(): void {
    const ctx = this.ready;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.crowd(t, 1.5, 700, 380, 0.24);
    for (let i = 0; i < 7; i++) {
      const start = t + Math.random() * 0.15;
      const f = 230 + Math.random() * 180;
      this.voice(start, 0.9 + Math.random() * 0.3, f, f * 0.7, 0.05);
    }
  }

  /** Many voices: band-passed noise with a swell, sweeping the band from one pitch to another. */
  private crowd(t: number, dur: number, fromHz: number, toHz: number, gain: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 0.9;
    band.frequency.setValueAtTime(fromHz, t);
    band.frequency.exponentialRampToValueAtTime(toHz, t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + dur * 0.25);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(band).connect(env).connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  /** One voice: a vowel-ish tone (saw through a formant filter) gliding between pitches. */
  private voice(t: number, dur: number, fromHz: number, toHz: number, gain: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus) return;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(fromHz, t);
    osc.frequency.exponentialRampToValueAtTime(toHz, t + dur);
    const formant = ctx.createBiquadFilter();
    formant.type = "bandpass";
    formant.frequency.value = 800;
    formant.Q.value = 3;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.06);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(formant).connect(env).connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noiseBurst(t: number, dur: number, hz: number, gain: number, type: BiquadFilterType): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = hz;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(env).connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.05);
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
