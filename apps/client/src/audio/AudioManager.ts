import { settingsStore } from "../settings";

/**
 * Game audio via Web Audio: sound files for UI and match moments, plus a few synthesized
 * effects. Graph: sources -> sfx bus / music bus -> master -> speakers.
 * The context is created on the first user gesture to respect autoplay rules.
 */
/**
 * Sound files in public/sfx: [level, format]. Levels make them sit together; the files are
 * trimmed, mono 24 kHz and loudness-matched (from the studio's sound packs). Short,
 * timing-critical sounds are WAV (no MP3 start delay); longer ones MP3.
 */
export const SAMPLES = {
  // UI
  click: [0.5, "wav"],
  reject: [0.6, "wav"],
  "menu-open": [0.55, "wav"],
  "menu-close": [0.45, "wav"],
  purchase: [0.7, "mp3"],
  coins: [0.7, "wav"],
  "no-coins": [0.6, "wav"],
  equip: [0.6, "wav"],
  error: [0.6, "wav"],
  warning: [0.6, "wav"],
  invite: [0.7, "wav"],
  friend: [0.65, "wav"],
  "level-up": [0.85, "wav"],
  "powerup-on": [0.7, "mp3"],
  "powerup-off": [0.6, "wav"],
  // Match moments
  countdown: [0.55, "wav"],
  go: [0.8, "wav"],
  hit: [0.6, "wav"],
  dash: [0.45, "wav"],
  cheer: [0.6, "wav"],
  aww: [0.6, "wav"],
  win: [0.7, "mp3"],
  lose: [0.6, "mp3"],
  "ringout-final": [0.9, "wav"],
  "fly-out": [0.45, "wav"],
  thud: [0.55, "wav"],
  counter: [0.75, "wav"],
  clash: [0.7, "wav"],
  combo: [0.4, "wav"],
  saved: [0.55, "wav"],
  "ring-shrink": [0.6, "wav"],
  "edge-alert": [0.3, "wav"],
} as const satisfies Record<string, readonly [number, "wav" | "mp3"]>;
export type SampleName = keyof typeof SAMPLES;

class AudioManager {
  private sampleFiles = new Map<SampleName, Promise<ArrayBuffer | null>>();
  private sampleBuffers = new Map<SampleName, Promise<AudioBuffer | null>>();
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

  /** Downloads every sound file (small; works before audio is unlocked). */
  preloadSamples(): Promise<unknown> {
    return Promise.all((Object.keys(SAMPLES) as SampleName[]).map((name) => this.sampleFile(name)));
  }

  private sampleFile(name: SampleName): Promise<ArrayBuffer | null> {
    let pending = this.sampleFiles.get(name);
    if (!pending) {
      pending = fetch(`${import.meta.env.BASE_URL}sfx/${name}.${SAMPLES[name][1]}`)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null);
      this.sampleFiles.set(name, pending);
    }
    return pending;
  }

  /**
   * Plays a sound file (decoded once, then reused). `rate` above 1 plays it faster and higher;
   * `volume` scales its level.
   */
  sample(name: SampleName, rate = 1, volume = 1): void {
    const ctx = this.ready;
    if (!ctx || !this.sfxBus) return;
    let decoded = this.sampleBuffers.get(name);
    if (!decoded) {
      decoded = this.sampleFile(name).then(async (data) => {
        if (!data) return null;
        try {
          return await ctx.decodeAudioData(data.slice(0));
        } catch {
          return null;
        }
      });
      this.sampleBuffers.set(name, decoded);
    }
    void decoded.then((buffer) => {
      if (!buffer || !this.sfxBus || ctx.state !== "running") return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = rate;
      const gain = ctx.createGain();
      gain.gain.value = SAMPLES[name][0] * volume;
      src.connect(gain).connect(this.sfxBus);
      src.start();
    });
  }

  click(): void {
    this.sample("click");
  }

  reject(): void {
    this.sample("reject");
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

  /** A push landing: harder hits are louder and a little lower. */
  impact(strength: number): void {
    const s = Math.min(1, strength / 12);
    this.sample("hit", 1.12 - s * 0.24, 0.55 + s * 0.45);
  }

  dash(): void {
    this.sample("dash", 0.95 + Math.random() * 0.1);
  }

  /** Someone is knocked out: a falling tone. */
  eliminated(): void {
    this.tone(620, 0.55, "square", 0.12, 90);
  }

  /** The 3-2-1 ticks. */
  countdown(): void {
    this.sample("countdown");
  }

  /** The bout starts: "Fight!". */
  go(): void {
    this.sample("go");
  }

  /** You pushed someone out. */
  crowdCheer(): void {
    this.sample("cheer");
  }

  /** You were pushed out. */
  crowdAww(): void {
    this.sample("aww");
  }

  victory(): void {
    this.sample("win");
  }

  roundEnd(): void {
    this.sample("lose");
  }
}

export const audio = new AudioManager();
