# Contributing to CaptionsEasy

Thanks for helping! A few ground rules keep things smooth.

## Setup

See "Run it locally" in the [README](README.md). Use **pnpm** (not npm or yarn).

## Before you open a PR

```bash
pnpm typecheck
pnpm test
pnpm build
```

All three must pass. Add a test for new logic and for every bug you fix.

## Caption rendering rules

Captions are rendered by Remotion, so everything you see must be a pure function of the current frame:

- No CSS transitions/animations, timers, `Date.now()` or `Math.random()` in compositions (use Remotion's `random(seed)`).
- Read fps from `useVideoConfig()`, never hard-code it.
- Text is measured with `@remotion/layout-utils` after fonts load.
- Whatever you change must look the same in the preview and the exported MP4.

## Adding a look

Looks live in `packages/templates/src/registry.ts`. A look is a template plus a tuned style. Each look must look
different from the others (`registry.test.ts` enforces this). Regenerate the gallery previews afterwards:

```bash
pnpm --filter @capseasy/compositions previews
```

## Commits

One logical change per PR, with a clear description of what and why. Never commit secrets or `.env` files.
