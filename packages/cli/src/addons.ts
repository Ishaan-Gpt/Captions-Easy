/**
 * The optional add-ons. The core package stays tiny (looks, styles, caption props, MCP); heavy, machine-specific
 * pieces install only when wanted and are loaded on first use:
 *   captionseasy-render       headless Chrome rendering (@remotion/renderer + the pre-bundled composition)
 *   captionseasy-transcribe   local Whisper speech-to-text (transformers.js + onnxruntime-node)
 */
import { CaptionsEasyError } from "./errors";
import { IS_BROWSER_BUILD } from "./version";
import type { RenderOptions, RenderResult, TranscribeOptions, Transcript } from "./types";

export const ADDONS = {
  render: {
    pkg: "captionseasy-render",
    what: "Rendering videos",
    size: "~75 MB: Remotion's renderer, ffmpeg and the caption composition; it fetches a headless Chrome (~100 MB) on first render",
  },
  transcribe: {
    pkg: "captionseasy-transcribe",
    what: "Transcribing speech",
    size: "~540 MB: Whisper on onnxruntime; it downloads a ~200 MB speech model on first use",
  },
} as const;

export interface RenderAddon {
  render(opts: RenderOptions): Promise<RenderResult>;
}
export interface TranscribeAddon {
  transcribe(videoPath: string, opts?: TranscribeOptions): Promise<Transcript>;
}

export const installHint = (kind: keyof typeof ADDONS) => {
  const a = ADDONS[kind];
  return {
    install: `npm i ${a.pkg}`,
    npx: `npx -p captionseasy -p ${a.pkg} captionseasy ...`,
    message: `${a.what} is an optional add-on. Install it next to captionseasy: \`npm i ${a.pkg}\` (${a.size}). With npx: \`npx -p captionseasy -p ${a.pkg} captionseasy ...\`.`,
  };
};

const isMissing = (e: unknown, pkg: string) => {
  const err = e as { code?: string; message?: string };
  return (err?.code === "ERR_MODULE_NOT_FOUND" || err?.code === "MODULE_NOT_FOUND") && String(err.message).includes(pkg);
};

/** Import an add-on, or throw ADDON_MISSING with the exact install command. */
export async function loadAddon(kind: "render"): Promise<RenderAddon>;
export async function loadAddon(kind: "transcribe"): Promise<TranscribeAddon>;
export async function loadAddon(kind: keyof typeof ADDONS): Promise<unknown> {
  const mod = await importAddon(ADDONS[kind].pkg, kind);
  return kind === "render" ? guardRender(mod as RenderAddon & { version?: string }) : mod;
}

/** Options that need captionseasy-render >= 0.2.0 (older renders bundle the 0.1.x caption builder and ignore them). */
const RENDER_020: (keyof RenderOptions)[] = ["theme", "roles", "roleMap", "stamps", "layout", "tracks"];

/** "0.1.1" < "0.2.0" (plain x.y.z; anything unparsable counts as old) */
export const atLeast = (v: string | undefined, min: string) => {
  const p = (s: string) => s.split(/[.-]/).slice(0, 3).map((x) => Number(x));
  if (!v) return false;
  if (v.endsWith("-dev")) return true; // workspace source build
  const a = p(v), b = p(min);
  if (a.some((x) => !Number.isFinite(x))) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]!;
  return true;
};

/** A 0.1.x render add-on would silently drop the 0.2.0 options: say so, with the upgrade command. */
export function guardRender(mod: RenderAddon & { version?: string }): RenderAddon {
  return {
    async render(opts: RenderOptions) {
      const used = RENDER_020.filter((k) => opts[k] !== undefined);
      if ((opts.overlayFormat as string) === "png-sequence") used.push("overlayFormat" as never);
      if (used.length && !atLeast(mod.version, "0.2.0")) {
        const install = "npm i captionseasy-render@^0.2.0";
        throw new CaptionsEasyError("ADDON_MISSING", `Options ${used.join(", ")} need captionseasy-render 0.2.0 or newer (installed: ${mod.version ?? "0.1.x"}). Update it: \`${install}\`.`, { addon: "captionseasy-render", install, installed: mod.version ?? null, needs: "0.2.0" });
      }
      return mod.render(opts);
    },
  };
}

/** Import `pkg`, turning "not installed" into ADDON_MISSING with the install command for `kind`. */
export async function importAddon(pkg: string, kind: keyof typeof ADDONS): Promise<unknown> {
  if (IS_BROWSER_BUILD) {
    throw new CaptionsEasyError("NODE_ONLY", `${ADDONS[kind].what} runs in Node (it needs ${pkg}). In the browser, draw the props with captionseasy/react, captionseasy/remotion or captionseasy-web, and render the file on a server.`, { addon: pkg });
  }
  try {
    return await import(/* webpackIgnore: true */ pkg);
  } catch (e) {
    if (isMissing(e, pkg)) {
      const hint = installHint(kind);
      throw new CaptionsEasyError("ADDON_MISSING", hint.message, { addon: pkg, install: hint.install, npx: hint.npx });
    }
    throw e;
  }
}
