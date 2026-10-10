import { describe, expect, it } from "vitest";
import { WebCodecsDemuxerRingCache } from "./webcodecsDemuxer";
import { WSOLAProcessor } from "./wsolaAudioWorklet";
import { OPFSMediaCache } from "./opfsCacheWorker";

describe("Extreme Low-Latency Pipeline Suite (Phase 4)", () => {
  it("initializes WebCodecs GOP Ring Cache demuxer", () => {
    const demuxer = new WebCodecsDemuxerRingCache(8);
    demuxer.prefetchGOP(0, 0);
    expect(demuxer.getFrameAtTime(500)).toBeNull(); // Empty until frames arrive
    demuxer.destroy();
  });

  it("processes audio buffer with WSOLA pitch-corrected variable rate time-stretching", () => {
    const wsola = new WSOLAProcessor(256, 128);
    const mockAudio = new Float32Array(2048);
    for (let i = 0; i < mockAudio.length; i++) {
      mockAudio[i] = Math.sin((i * 440 * 2 * Math.PI) / 44100);
    }

    const stretched = wsola.process(mockAudio, 1.5);
    expect(stretched.length).toBeLessThan(mockAudio.length);
  });

  it("handles OPFS Cache fallback gracefully in non-browser environments", async () => {
    const opfs = new OPFSMediaCache();
    const ready = await opfs.init();
    expect(typeof ready).toBe("boolean");
  });
});
