# Releasing the CaptionsEasy npm packages

`.github/workflows/release.yml` publishes on every push to `main` that touches `packages/`. For each of
`captionseasy`, `captionseasy-transcribe`, `captionseasy-render` and `captionseasy-web`, it checks whether the
`version` in its `package.json` is on npm. Any that isn't gets tested, built (`pnpm release:build`, with the dist
checks) and published, in that order. A push that doesn't bump a version publishes nothing.

## To release

1. Bump `version` in the package's `package.json` and add its `CHANGELOG.md` entry (say whether existing look output
   changed).
2. Push to `main`. The workflow does the rest. Watch it under Actions > release.

## One-time setup

Use **B, trusted publishing**. Option A only works with a token that can publish without a 2FA one-time password,
and npm is withdrawing those: a normal token fails in CI with `EOTP` (seen 2026-11-19). A package that has never been
published can't get trusted publishing yet, so publish its first version by hand (below); the workflow skips it with a
warning until then.

### Options

**A. An npm token (simplest).** On npmjs.com: your avatar > Access Tokens > Generate New Token > Granular Access
Token, with *Read and write* on the four packages (or *All packages*) and a long expiry. Then save it as a
repository secret, from this repo:

```bash
gh secret set NPM_TOKEN --repo Ishaan-Gpt/CaptionsEasy
```

(It asks for the value, so the token never lands in your shell history.)

**B. npm trusted publishing (no token).** On npmjs.com, for each of the four packages: Settings > Trusted
publishing > GitHub Actions, organisation/user `Ishaan-Gpt`, repository `CaptionsEasy`, workflow `release.yml`.
Leave the `NPM_TOKEN` secret unset. If npm refuses because the packages' `repository` field names the public mirror
(`Captions-Easy`), use option A.

## By hand (from your machine)

```bash
npm login
pnpm release:build
cd packages/cli && npm publish --access public
```

Then the same in `packages/cli-transcribe`, `packages/cli-render` and `packages/web`, for any whose version is new.
