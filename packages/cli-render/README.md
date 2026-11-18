# captionseasy-render

This is the optional **rendering add-on** for [`captionseasy`](https://www.npmjs.com/package/captionseasy). It renders CaptionsEasy captions on your machine with Remotion and headless Chrome. It can produce:
- An MP4 with the captions burned in, keeping the original audio.
- A transparent captions-only overlay at the video's size and length, as ProRes 4444 `.mov`, VP9 `.webm`, or a folder of transparent PNGs (`overlayFormat: "png-sequence"`).

```bash
npm i captionseasy captionseasy-render
npx captionseasy talk.mp4 --look 12 --words talk.words.json            # -> talk.captioned.mp4
npx captionseasy talk.mp4 --look 12 --words talk.words.json --overlay  # -> talk.captions.mov
```

```ts
import { render } from "captionseasy"; // loads this add-on on demand
await render({ video: "talk.mp4", words, look: 12, mode: "burn" });

// a transparent PNG sequence for ffmpeg / any editor: `out` is a folder (default talk.captions/)
import { render as renderPng } from "captionseasy-render";
const r = await renderPng({ video: "talk.mp4", words, look: 12, mode: "overlay", overlayFormat: "png-sequence" });
// r.frames = 300, r.pattern = "frame_%03d.png"
//   -> ffmpeg -framerate 30 -i talk.captions/frame_%03d.png -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le captions.mov
```

To draw captions in the browser instead, with no server and no Chrome to download, use [`captionseasy-web`](https://www.npmjs.com/package/captionseasy-web).

- **Size:** about 75 MB installed, including `@remotion/renderer` and its ffmpeg. A headless Chrome (about 100 MB) downloads on the first render.
- **Speed:** a burn-in renders only the captions in Chrome, then lays them over the video with the bundled ffmpeg, with the same pixels as drawing the video in Chrome. Looks made from the video (#87, #118, #132) and backdrop blurs still draw the video in Chrome. `fastBurn: false` turns the fast path off. If Remotion's compositor crashes ("Compositor quit"), lower `--concurrency`.
- **No build step at your end:** the caption composition ships pre-bundled, so webpack never runs on your machine.
- **Transcription:** to caption a video without words, also install `captionseasy-transcribe`.

**Licence:** MIT. Rendering uses [Remotion](https://www.remotion.dev/license). Remotion is free for individuals and for companies of up to 3 people; larger companies need a Remotion company licence.
