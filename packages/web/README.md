# captionseasy-web

Draw any [CaptionsEasy](https://www.npmjs.com/package/captionseasy) caption look in a web page: on a `<canvas>` or as a live DOM layer, as a pure function of time. It can also export transparent overlay frames (a PNG sequence or a VP9-alpha WebM) in the browser.

You don't need React or Remotion. Both are bundled in, together with the exact caption composition that the CaptionsEasy studio previews and `captionseasy-render` renders. You pass it the props from `buildCaptions()`. Building a React app? Use `captionseasy/react` instead: it uses your own React, so you don't ship a second copy.

```bash
npm i captionseasy-web          # browser ESM, no dependencies
```

`captionseasy` (the core package) stays dependency-free. This renderer is a separate, opt-in package.

## Quick start

Make the props anywhere `captionseasy` runs: right in the page (`import { buildCaptions } from "captionseasy"`, since captionseasy 0.3.0), or in Node, a build step, your server or an agent. They are plain JSON:

```bash
npx captionseasy build --words talk.words.json --look 12 --out props.json
```

Then draw them in the browser:

```html
<div id="stage" style="position: relative; width: 360px; aspect-ratio: 9/16">
  <video id="v" src="talk.mp4" style="width: 100%; height: 100%" controls></video>
</div>
<script type="module">
  import { mountCaptions } from "captionseasy-web";
  const props = await (await fetch("props.json")).json();
  const v = document.getElementById("v");

  // DOM layer on top of the video, laid out for the video's own size (scaled to fit the container)
  const captions = mountCaptions(document.getElementById("stage"), props, { width: 1080, height: 1920 });
  await captions.ready();                                  // fonts loaded, captions committed
  const loop = () => { captions.render(v.currentTime * 1000); requestAnimationFrame(loop); };
  loop();
</script>
```

Canvas: composite the captions over a video frame yourself.

```js
import { drawCaptions, ready } from "captionseasy-web";

await ready(props, { width: 1080, height: 1920 });          // load the look's fonts once
ctx.drawImage(video, 0, 0, 1080, 1920);
await drawCaptions(ctx, props, video.currentTime * 1000, { width: 1080, height: 1920 });
```

Export transparent overlay frames, rendered frame by frame in the tab:

```js
import { exportFrames, frameFileName } from "captionseasy-web";

const { frames, fps } = await exportFrames(props, { width: 1080, height: 1920, fps: 30, format: "png-sequence" });
// frames[i] is a PNG Blob. Save them as frameFileName(i) = frame_00000.png ..., then:
//   ffmpeg -framerate 30 -i frame_%05d.png -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le captions.mov
const { blob } = await exportFrames(props, { width: 1080, height: 1920, format: "webm" });   // VP9 with alpha
```

## API

| | |
| --- | --- |
| `mountCaptions(container, props, { width, height, fps?, fit? })` | Live DOM layer. Returns `{ render(timeMs), update(props), ready(), element, destroy() }`. `render` is synchronous and the same time always gives the same DOM. `fit: "contain"` (default) scales the `width x height` composition into the container; `"none"` keeps 1 px per composition px. |
| `drawCaptions(ctx, props, timeMs, { width, height, scale?, x?, y?, fps?, engine? })` | Draws one moment onto a `CanvasRenderingContext2D` or `OffscreenCanvasRenderingContext2D`, over whatever is already there. Async. |
| `renderCaptionsFrame(props, timeMs, options)` | The same as `drawCaptions`, but returns a new transparent canvas (`width*scale x height*scale`). |
| `exportFrames(props, { width, height, fps?, format?, startMs?, endMs?, scale?, bitrate?, engine?, onProgress?, signal? })` | Returns `{ format, engine, fps, width, height, startFrame, frameCount, frames? (PNG Blobs), blob? (WebM) }`. |
| `ready(props, size?)` | Loads every font the captions use: the look's Google fonts, hero and accent fonts, emoji, Devanagari fallbacks, and every track's look. Draws wait for this anyway; await it once so the first draw is fast. |
| `releaseCaptions()` | Frees the off-screen mount that `drawCaptions` keeps for the last props. |
| `canUseSvgEngine()` | Tells you whether this browser lets a page read back a `foreignObject` drawing (see Engines). |
| `frameAt(timeMs, fps, frames)`, `frameFileName(i)` | Helpers. |

**Props.** `props` is the object `buildCaptions()` returns: `{ doc, style, settings, layout?, tracks?, ... }`. Fields the caption composition reads are passed through untouched. That includes multi-look `tracks` (several looks in one video, with their transitions): a three-track props object (hook, body and number stamps) drew identically to the server render at 5 moments, with 0.01% or less off. Report-only fields (`look`, `warnings`, `theme`, `roles`) are ignored.

**Time.** Time is sampled like a Remotion render. At `fps` (default 30), time `t` shows frame `floor(t * fps / 1000)`. So `drawCaptions(..., t)` gives the same pixels as frame `floor(t * fps / 1000)` of a `captionseasy-render` overlay of the same size. Pass `fps: 60` for smoother DOM playback.

**Size.** `width`/`height` is the composition size the look is laid out for. Use the video's own pixel size (for example 1080x1920) so the captions sit exactly where a server render would put them. `scale` changes only the output pixel density.

## Engines (canvas and export)

`engine: "auto"` (the default) picks `"svg"` where the browser supports it and `"remotion"` everywhere else.

- **`"svg"`**: the live caption DOM is serialised into an SVG `<foreignObject>` and painted by the browser itself. Every web font the captions use is embedded as a `data:` URL, and `<canvas>` children are snapshotted. Chromium paints this the same way it paints the server renderer's screenshot, so the output matches `captionseasy-render` almost exactly: 97 of 100 looks have 0.0–0.6% of caption pixels off. The worst are #123 (3D flip, 2.9%), #21 (rotated labels, 1.9%) and #90 (1.1%), where rotated glyph edges are anti-aliased slightly differently (see Accuracy). After the first draw of a set of props, each frame only re-renders and re-paints.
  - Chromium (tested) lets the page read the result back, so export works there. Firefox is expected to work too; `canUseSvgEngine()` checks at run time.
  - Safari draws it but taints the canvas, so `"auto"` uses `"remotion"` there.
  - Text in Firefox is painted by Firefox's own text engine, so glyph anti-aliasing differs slightly from Chrome.
- **`"remotion"`**: [`@remotion/web-renderer`](https://www.remotion.dev/docs/web-renderer/), the DOM-to-canvas engine the CaptionsEasy studio uses for its in-browser MP4 export. It works without `foreignObject`. It redraws CSS itself, so some looks are approximated: filters on transformed elements, 3D flips, motion-blur trails and `mix-blend-mode`. See the regression table for which looks are affected. It reports one usage event to Remotion per render call, and you can pass your `licenseKey` (see Licences).

The DOM renderer (`mountCaptions`) is the browser itself, so it matches the server renderer in every engine.

## Accuracy: visual regression against Remotion

`scripts/regression.mjs` renders every gallery look at 3 moments (300, 1300 and 2900 ms, 720x1280, 30 fps). It renders each one twice:

- with `captionseasy-web` on a canvas, in headless Chrome
- with Remotion's server renderer (`renderStill` of the same composition)

It then compares the two images:

- **off** (the pass metric): the share of caption pixels with no pixel within ±1 px in the other image closer than 48/255. It tolerates sub-pixel text placement.
- **coarse**: the share of caption-covered 4x4 blocks whose mean colour differs by more than 32/255. This catches layout, colour, and missing or extra elements.
- **aa**: the share of caption pixels that differ by more than 48/255 at the same position. This includes glyph anti-aliasing.

With the `svg` engine, the median look has 0.00% off and every look passes its threshold (2%; 4% for #123 and 3% for #21). With the `remotion` engine, the median is 6.8% off and the worst is 74% (#98: gradient text fill and shadow composited differently).

Results from the last run are in [`regression-results.md`](./regression-results.md).

```bash
node scripts/build.mjs && node scripts/regression.mjs --engine svg        # or --engine remotion; --looks 1,5,12
CAPTIONSEASY_WEB_REGRESSION=1 npx vitest run test/regression.test.ts        # the same, as an opt-in test
```

The default `vitest` run includes a fast subset in headless Chrome:

- determinism (pixel hashes) for both engines
- the DOM renderer as a pure function of time
- PNG and WebM export
- 6 representative looks compared with committed Remotion renders in `test/fixtures`

## Node: overlay PNG sequence

The Node-side path is `captionseasy-render` (Remotion with headless Chrome). It can now write a transparent PNG sequence as well as `.mov` and `.webm`:

```js
import { render } from "captionseasy-render";
const r = await render({ video: "talk.mp4", words, look: 12, mode: "overlay", overlayFormat: "png-sequence", out: "talk.captions" });
// r.frames = 300, r.pattern = "frame_%03d.png"  ->  ffmpeg -framerate 30 -i talk.captions/frame_%03d.png ...
```

## Caveats

- **Fonts load from Google Fonts** (`fonts.gstatic.com`) and jsDelivr at run time, so the page needs network access to them. A strict CSP must allow `font-src` and `connect-src` for those hosts. The `"svg"` engine fetches the font files to embed them.
- **Difference look (#118).** `difference_invert` blends with the video picture. On a transparent canvas there is no picture, so it renders as plain text, the same as a `captionseasy-render` overlay.
- **`drawCaptions` is async.** For playback of 30 fps or more over a `<video>`, use `mountCaptions`. Use the canvas path for compositing and export.
- Each page shows one caption frame at a time: calls to `drawCaptions`/`renderCaptionsFrame` are queued.
- **Chrome console warnings.** With `engine: "remotion"`, Chrome logs `CanvasFontStretch` warnings from `@remotion/web-renderer`. They are harmless.

## Size

The package is about **1.8 MB unpacked** (**about 440 KB packed**, 87 files).

- The entry plus React, react-dom and Remotion is about 900 KB minified, about 260 KB gzipped. The looks are about 400 KB of that.
- These load only when used: the `"remotion"` engine and the WebM encoder (`@remotion/web-renderer` and `mediabunny`, about 340 KB), and one small chunk per Google font.

## Licences

- `captionseasy-web`: MIT.
- Bundled third-party code keeps its own licence:
  - React and react-dom: MIT.
  - [mediabunny](https://github.com/Vanilagy/mediabunny): MPL-2.0, unmodified.
  - [Remotion](https://www.remotion.dev) and `@remotion/web-renderer`: Remotion License. Remotion is free for individuals and for companies of up to 3 people; larger companies need a [Remotion company licence](https://www.remotion.dev/license). This is the same rule as for `captionseasy/remotion` and `captionseasy-render`.
- `licenseKey`: the `"remotion"` engine and `@remotion/web-renderer` report usage to Remotion. Pass your company `licenseKey`, or `"free-license"` (the default) if you qualify for the free licence.
- Fonts: Google Fonts (open licences).
