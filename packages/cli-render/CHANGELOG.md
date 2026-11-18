# Changelog: captionseasy-render

"Existing look output: unchanged" is verified by the per-look render-hash guard
(`packages/templates/src/compat.test.tsx`) and the 0.1.x API guard (`packages/cli/test/compat.test.ts`).

## 0.2.0

- Faster burn-in (about 2-3x): looks that only draw on top of the picture render the transparent captions alone
  and are laid over the decoded video outside Chrome, then encoded with the bundled ffmpeg (H.264 CRF 18, AAC).
  Looks made from the video (#87, #118, #132) keep the full in-Chrome render; `fastBurn: false` forces it.
  A Remotion compositor crash now fails as `RENDER_FAILED` with a hint to lower `--concurrency`.
  Existing look output: the same captions; the encoded picture differs slightly from the old JPEG-based burn
  (38-40 dB) and is closer to the source.
- Rebuilt bundled site: renders the captionseasy 0.2.0 composition, so themes, multi-look `tracks` (cut,
  exit-entry and morph transitions), word roles and stamps, Hinglish `romanize` / `hinglishSpelling` with Devanagari
  fallback fonts, layout safety (`layout: { safeZone, avoid }`), look #128 and the five premium looks #129 to #133
  (Premium Caption 1.1, 1.2, 2, 3, 4) all render.
  Existing look output: unchanged.
- `overlayFormat: "png-sequence"`: a folder of transparent PNGs (`frame_%03d.png`); the result adds `frames` and
  `pattern`. Existing look output: unchanged (mov / webm untouched).
- Bug fix — #126 Afterimage Zoom: long lines no longer run off the frame. Existing look output: changed for #126 only
  (intentional fix); all other looks unchanged.
- Exports `version`, which captionseasy >= 0.2.0 checks before passing 0.2.0-only options.
- Deterministic word ids (via captionseasy 0.2.0): the same input renders identical frames on every run.
  Existing look output: unchanged.

## 0.1.1

- Carries look #128 Editorial Depth Stack. Existing look output: unchanged.

## 0.1.0

- First release: burn captions into an MP4 or export a transparent ProRes 4444 `.mov` / VP9 `.webm` overlay with
  Remotion, locally, from a pre-bundled composition.
