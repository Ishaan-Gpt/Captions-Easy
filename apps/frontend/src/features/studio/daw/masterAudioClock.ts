/**
 * Master Clock Synchronization Core (Phase 6).
 * AudioContext-driven master clock that slaves video playhead timing to the hardware audio clock,
 * preventing A/V cumulative drift over long timelines and enabling sub-frame sample-accurate precision.
 */

export interface ClockState {
  playing: boolean;
  timelineMs: number;
  samplePosition: number; // Exact sample offset at 48kHz / 192kHz
  sampleRate: number;
}

export class MasterAudioClock {
  private audioCtx: AudioContext | null = null;
  private audioStartTime: number = 0;
  private timelineStartMs: number = 0;
  private playbackRate: number = 1.0;
  private playing: boolean = false;
  private sampleRate: number = 48000;

  constructor(sampleRate: number = 48000) {
    this.sampleRate = sampleRate;
  }

  /**
   * Initializes or re-uses the browser Web Audio API AudioContext.
   */
  public async init(): Promise<boolean> {
    if (typeof window === "undefined") return false;
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return false;
      this.audioCtx = new AudioCtxClass({ sampleRate: this.sampleRate });

      const primeAudio = () => {
        if (this.audioCtx && this.audioCtx.state === "suspended") {
          void this.audioCtx.resume();
        }
        window.removeEventListener("pointerdown", primeAudio);
        window.removeEventListener("keydown", primeAudio);
      };
      window.addEventListener("pointerdown", primeAudio);
      window.addEventListener("keydown", primeAudio);

      if (this.audioCtx.state === "suspended") {
        await this.audioCtx.resume().catch(() => undefined);
      }
      this.sampleRate = this.audioCtx.sampleRate;
      return true;
    } catch (e) {
      console.warn("MasterAudioClock AudioContext initialization failed:", e);
      return false;
    }
  }

  public play(fromMs: number = 0, rate: number = 1.0): void {
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      void this.audioCtx.resume();
    }
    this.playing = true;
    this.timelineStartMs = fromMs;
    this.playbackRate = rate;
    this.audioStartTime = this.audioCtx ? this.audioCtx.currentTime : performance.now() / 1000;
  }

  public pause(): void {
    if (this.playing) {
      this.timelineStartMs = this.getCurrentTimelineMs();
      this.playing = false;
    }
  }

  public seek(toMs: number): void {
    this.timelineStartMs = Math.max(0, toMs);
    if (this.playing && this.audioCtx) {
      this.audioStartTime = this.audioCtx.currentTime;
    }
  }

  public setPlaybackRate(rate: number): void {
    if (this.playing) {
      this.timelineStartMs = this.getCurrentTimelineMs();
      if (this.audioCtx) {
        this.audioStartTime = this.audioCtx.currentTime;
      }
    }
    this.playbackRate = Math.max(0.1, Math.min(5.0, rate));
  }

  /**
   * Returns current timeline time in milliseconds slaved to hardware AudioContext clock.
   */
  public getCurrentTimelineMs(): number {
    if (!this.playing) return this.timelineStartMs;

    const currentAudioTime = this.audioCtx ? this.audioCtx.currentTime : performance.now() / 1000;
    const elapsedSec = currentAudioTime - this.audioStartTime;
    return Math.max(0, this.timelineStartMs + elapsedSec * 1000 * this.playbackRate);
  }

  /**
   * Returns exact sub-frame sample offset at hardware sample rate (e.g., 48000 Hz).
   */
  public getCurrentSamplePosition(): number {
    const timelineMs = this.getCurrentTimelineMs();
    return Math.round((timelineMs / 1000) * this.sampleRate);
  }

  public isPlaying(): boolean {
    return this.playing;
  }

  public getSampleRate(): number {
    return this.sampleRate;
  }
}
