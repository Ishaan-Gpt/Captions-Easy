/**
 * Streaming windowed-sinc resampler to 16 kHz (what Whisper expects) plus a mono downmix. Linear interpolation
 * aliases speech badly enough to hurt accuracy, so this uses a Hann-windowed sinc low-pass with a precomputed
 * polyphase table (512 sub-sample phases): ~0.3 s for a 3-minute 48 kHz clip.
 */

const TAPS = 12; // lobes per side at the output rate
const PHASES = 512;

export class Resampler {
  private readonly step: number;
  private readonly radius: number;
  private readonly table: Float32Array; // [phase][k]
  private readonly width: number;
  private buf = new Float32Array(0);
  private bufStart = 0; // absolute input index of buf[0]
  private nextOut = 0;

  constructor(private readonly srcRate: number, private readonly dstRate = 16_000) {
    this.step = srcRate / dstRate;
    const cutoff = Math.min(1, dstRate / srcRate);
    this.radius = Math.ceil(TAPS / cutoff);
    this.width = this.radius * 2;
    this.table = new Float32Array(PHASES * this.width);
    for (let p = 0; p < PHASES; p++) {
      const frac = p / PHASES;
      let sum = 0;
      for (let k = 0; k < this.width; k++) {
        const x = k - this.radius + 1 - frac; // input offset from the output centre
        const w = 0.5 + 0.5 * Math.cos((Math.PI * x) / this.radius);
        const v = Math.abs(x) >= this.radius ? 0 : sinc(x * cutoff) * cutoff * w;
        this.table[p * this.width + k] = v;
        sum += v;
      }
      if (sum) for (let k = 0; k < this.width; k++) this.table[p * this.width + k]! /= sum; // unity gain at DC
    }
  }

  /** Feed mono samples at srcRate; returns whatever 16 kHz samples are now complete. */
  push(input: Float32Array): Float32Array {
    if (this.srcRate === this.dstRate) return input;
    const merged = new Float32Array(this.buf.length + input.length);
    merged.set(this.buf);
    merged.set(input, this.buf.length);
    this.buf = merged;
    return this.drain(false);
  }

  /** End of stream: emit the tail (the missing right context counts as silence). */
  flush(): Float32Array {
    return this.srcRate === this.dstRate ? new Float32Array(0) : this.drain(true);
  }

  private drain(final: boolean): Float32Array {
    const out: number[] = [];
    const end = this.bufStart + this.buf.length; // absolute, exclusive
    for (;;) {
      const centre = this.nextOut * this.step;
      const base = Math.floor(centre);
      if (!final && base + this.radius >= end) break;
      if (final && centre >= end) break;
      const phase = Math.min(PHASES - 1, Math.round((centre - base) * PHASES) % PHASES);
      const row = phase * this.width;
      let acc = 0;
      for (let k = 0; k < this.width; k++) {
        const idx = base - this.radius + 1 + k - this.bufStart;
        if (idx >= 0 && idx < this.buf.length) acc += this.buf[idx]! * this.table[row + k]!;
      }
      out.push(acc);
      this.nextOut++;
    }
    // keep only the context the next output still needs
    const keepFrom = Math.max(this.bufStart, Math.floor(this.nextOut * this.step) - this.radius);
    if (keepFrom > this.bufStart) {
      this.buf = this.buf.slice(keepFrom - this.bufStart);
      this.bufStart = keepFrom;
    }
    return Float32Array.from(out);
  }
}

function sinc(x: number) {
  if (x === 0) return 1;
  const a = Math.PI * x;
  return Math.sin(a) / a;
}

/** Average planar channels into one. */
export function downmix(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0]!;
  const out = new Float32Array(channels[0]!.length);
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i]! += ch[i]!;
  const k = 1 / channels.length;
  for (let i = 0; i < out.length; i++) out[i]! *= k;
  return out;
}
