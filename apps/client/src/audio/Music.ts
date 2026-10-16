import { audio } from "./AudioManager";

/**
 * Background music from files in public/music, looped seamlessly with Web Audio and
 * crossfaded when the mode changes:
 * - "menu": home, lobby and results (Japanese bamboo flute loop).
 * - "bout": countdown and match (taiko percussion loop).
 * Volume comes from Settings (music bus in AudioManager).
 */
export type MusicMode = "off" | "menu" | "bout";

const TRACKS: Record<Exclude<MusicMode, "off">, { file: string; gain: number }> = {
  // Per-track level so both feel equally loud (the flute loop is ~4 dB hotter).
  menu: { file: "music/home.mp3", gain: 0.62 },
  bout: { file: "music/match.mp3", gain: 1 },
};

const FADE_IN_S = 1.6;
const FADE_OUT_S = 1.8;

interface Playing {
  mode: Exclude<MusicMode, "off">;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

class Music {
  private mode: MusicMode = "off";
  private current: Playing | null = null;
  private files = new Map<string, Promise<ArrayBuffer | null>>();
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private switchId = 0;
  private offReady: (() => void) | null = null;

  /** Downloads a track ahead of time (works before audio is unlocked). */
  preload(mode: Exclude<MusicMode, "off">): Promise<unknown> {
    return this.fetchFile(TRACKS[mode].file);
  }

  private rate = 1;

  /** Playback speed of the current track (the final stretch plays a little faster). */
  setTempo(rate: number): void {
    if (rate === this.rate) return;
    this.rate = rate;
    const ctx = audio.context;
    if (ctx && this.current) this.current.source.playbackRate.linearRampToValueAtTime(rate, ctx.currentTime + 1.2);
  }

  setMode(mode: MusicMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.offReady?.();
    // Runs now if audio is already unlocked, otherwise after the first tap or key press.
    this.offReady = audio.onReady(() => void this.apply());
  }

  private fetchFile(file: string): Promise<ArrayBuffer | null> {
    let pending = this.files.get(file);
    if (!pending) {
      pending = fetch(`${import.meta.env.BASE_URL}${file}`)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null);
      this.files.set(file, pending);
    }
    return pending;
  }

  private decode(ctx: AudioContext, file: string): Promise<AudioBuffer | null> {
    let pending = this.buffers.get(file);
    if (!pending) {
      pending = this.fetchFile(file).then(async (data) => {
        if (!data) return null;
        try {
          // decodeAudioData detaches the buffer, so decode a copy.
          return await ctx.decodeAudioData(data.slice(0));
        } catch {
          return null;
        }
      });
      this.buffers.set(file, pending);
    }
    return pending;
  }

  private async apply(): Promise<void> {
    const ctx = audio.context;
    const bus = audio.music;
    if (!ctx || !bus) return;
    const target = this.mode;
    if (this.current?.mode === target) return;
    const id = ++this.switchId;

    // Fade the old track out (it keeps playing underneath the new one: a crossfade).
    const old = this.current;
    this.current = null;
    if (old) {
      const t = ctx.currentTime;
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0, t + FADE_OUT_S);
      old.source.stop(t + FADE_OUT_S + 0.05);
    }
    if (target === "off") return;

    const track = TRACKS[target];
    const buffer = await this.decode(ctx, track.file);
    // A newer switch happened while loading: let that one win.
    if (!buffer || id !== this.switchId || this.mode !== target) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = this.rate;
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(track.gain, t + FADE_IN_S);
    source.connect(gain).connect(bus);
    source.start(t);
    this.current = { mode: target, source, gain };

    // Warm up the other track so the next switch is instant.
    void this.decode(ctx, TRACKS[target === "menu" ? "bout" : "menu"].file);
  }
}

export const music = new Music();
