/** VP9-with-alpha WebM encoding (mediabunny + WebCodecs), loaded only by exportFrames({ format: "webm" }). */
import { BufferTarget, CanvasSource, Output, WebMOutputFormat } from "mediabunny";

export interface WebmEncoder {
  canvas: OffscreenCanvas;
  add(timestampS: number, durationS: number): Promise<void>;
  finish(): Promise<Blob>;
  cancel(): Promise<void>;
}

export async function webmEncoder(width: number, height: number, fps: number, bitrate: number): Promise<WebmEncoder> {
  const canvas = new OffscreenCanvas(width, height);
  const target = new BufferTarget();
  const output = new Output({ format: new WebMOutputFormat(), target });
  const source = new CanvasSource(canvas, { codec: "vp9", bitrate, alpha: "keep" });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();
  return {
    canvas,
    add: (t, d) => source.add(t, d),
    finish: async () => {
      await output.finalize();
      return new Blob([target.buffer!], { type: "video/webm" });
    },
    cancel: () => output.cancel(),
  };
}
