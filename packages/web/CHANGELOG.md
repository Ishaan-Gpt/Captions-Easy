# Changelog: captionseasy-web

## 0.2.0

- First release: draw any CaptionsEasy look, theme or multi-look track on a `<canvas>` (`drawCaptions`,
  `renderCaptionsFrame`) or as a live DOM layer (`mountCaptions`) as a pure function of time, and export transparent
  overlay frames (PNG sequence or VP9-alpha WebM) in the browser (`exportFrames`). React, Remotion and the caption
  composition are bundled; no dependencies.
- Matches `captionseasy-render` within pixel tolerance: a visual regression per look against Remotion
  (`regression-results.md`). A gallery of every look x every theme: `node packages/web/gallery/generate.mjs`.
- Existing look output: not applicable (new package); it draws the same composition the server renderer uses,
  including the premium looks #129 to #133.
- In a React app, prefer `captionseasy/react` (captionseasy 0.3.0): it uses your own React instead of a bundled copy.
