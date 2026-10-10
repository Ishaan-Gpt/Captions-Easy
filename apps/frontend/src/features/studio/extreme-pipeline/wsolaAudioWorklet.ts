/**
 * WSOLA (Waveform Similarity Overlap-Add) DSP Engine.
 * Performs pitch-corrected time-stretching for variable-rate audio scrubbing (0.5x to 4.0x speed).
 */
export class WSOLAProcessor {
  private windowSize: number;
  private seekWindow: number;

  constructor(windowSize = 1024, seekWindow = 512) {
    this.windowSize = windowSize;
    this.seekWindow = seekWindow;
  }

  /**
   * Time-stretches audio input buffer by pitchRatio without distorting fundamental frequency pitch.
   */
  public process(
    inputChannel: Float32Array,
    playbackRate: number
  ): Float32Array {
    if (playbackRate === 1.0 || inputChannel.length < this.windowSize * 2) {
      return inputChannel;
    }

    const outputLength = Math.floor(inputChannel.length / playbackRate);
    const output = new Float32Array(outputLength);

    let inPos = 0;
    let outPos = 0;

    const hanning = new Float32Array(this.windowSize);
    for (let i = 0; i < this.windowSize; i++) {
      hanning[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (this.windowSize - 1)));
    }

    while (outPos + this.windowSize < outputLength && inPos + this.windowSize < inputChannel.length) {
      // Find maximum correlation position in seek window
      let bestOffset = 0;
      let maxCorr = -Infinity;

      for (let offset = -this.seekWindow / 2; offset < this.seekWindow / 2; offset++) {
        const testPos = Math.floor(inPos + offset);
        if (testPos < 0 || testPos + this.windowSize >= inputChannel.length) continue;

        let corr = 0;
        for (let k = 0; k < this.windowSize; k += 4) {
          corr += inputChannel[testPos + k] * (inputChannel[Math.floor(inPos) + k] || 0);
        }

        if (corr > maxCorr) {
          maxCorr = corr;
          bestOffset = offset;
        }
      }

      const matchPos = Math.floor(inPos + bestOffset);

      // Overlap-Add with Hanning window
      for (let i = 0; i < this.windowSize; i++) {
        if (outPos + i < outputLength && matchPos + i < inputChannel.length) {
          output[outPos + i] += inputChannel[matchPos + i] * hanning[i];
        }
      }

      inPos += this.windowSize * playbackRate;
      outPos += this.windowSize / 2;
    }

    return output;
  }
}
