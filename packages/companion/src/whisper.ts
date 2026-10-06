import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { downloadWhisperModel, installWhisperCpp, toCaptions, transcribe, type Language, type WhisperModel } from "@remotion/install-whisper-cpp";
import { fromWhisperCaptions, type NormalizeOptions } from "@motion-ai/caption-engine/core";
import type { Word } from "@capseasy/shared";
import { dirs } from "./config";
import { log } from "./log";

// pinned: newer whisper.cpp releases change the CLI flags Remotion relies on
export const WHISPER_CPP_VERSION = "1.5.5";
/** Binary only. installWhisperCpp() silently does NOTHING if this folder already exists, so never pre-create it. */
export const whisperDir = () => join(dirs.data, "whisper-bin");
/** Models live apart from the binary so a half-downloaded model can never block (re)installing the binary. */
export const modelsDir = () => join(dirs.data, "whisper-models");
const exePath = () => join(whisperDir(), process.platform === "win32" ? "main.exe" : "main");

export const whisperInstalled = () => existsSync(exePath());

let installing: Promise<void> | null = null;

const WIN_ZIP_URL = "https://remotion-ffmpeg-binaries.s3.eu-central-1.amazonaws.com/whisper-bin-x64-1-5-5.zip";
const psQuote = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * Windows: Remotion's installer hands the zip path to PowerShell unquoted, which breaks for any path with a
 * space (e.g. a profile folder like "Jane Doe"). Same prebuilt 1.5.5 binary, extracted with quoted literal paths.
 */
async function installWindows(to: string) {
  const res = await fetch(WIN_ZIP_URL);
  if (!res.ok) throw new Error(`download failed (HTTP ${res.status})`);
  const zip = join(dirs.cache, "whisper-bin-x64.zip");
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  try {
    await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Expand-Archive -Force -LiteralPath ${psQuote(zip)} -DestinationPath ${psQuote(to)}`], { windowsHide: true });
  } finally {
    rmSync(zip, { force: true });
  }
}

/** Installs whisper.cpp once (prebuilt zip on Windows; git clone + make elsewhere). Concurrent callers share one install. */
export function ensureWhisperBinary(): Promise<void> {
  if (whisperInstalled()) return Promise.resolve();
  installing ??= (async () => {
    // a previous failed install can leave a folder without the executable, which makes the installer skip work
    rmSync(whisperDir(), { recursive: true, force: true });
    mkdirSync(dirs.cache, { recursive: true });
    mkdirSync(dirs.data, { recursive: true });
    if (process.platform === "win32") {
      await installWindows(whisperDir());
    } else {
      const prev = process.cwd();
      try {
        process.chdir(dirs.cache); // the installer drops its download zip into the current directory
        await installWhisperCpp({ to: whisperDir(), version: WHISPER_CPP_VERSION, printOutput: false });
      } finally {
        process.chdir(prev);
      }
    }
    if (!whisperInstalled()) throw new Error(`the whisper executable was not found at ${exePath()} after installing`);
    log.info("whisper.cpp installed");
  })().catch((e) => {
    installing = null; // allow a retry on the next job
    throw new Error(
      `Could not set up whisper.cpp: ${e instanceof Error ? e.message : e}. ` +
        (process.platform === "win32" ? "Check your internet connection and free disk space." : "It needs git and make (macOS: xcode-select --install; Linux: build-essential)."),
    );
  });
  return installing;
}

export async function ensureModel(model: WhisperModel, onProgress?: (fraction: number) => void, signal?: AbortSignal) {
  mkdirSync(modelsDir(), { recursive: true });
  const r = await downloadWhisperModel({ model, folder: modelsDir(), printOutput: false, signal, onProgress: (downloaded, total) => onProgress?.(total ? downloaded / total : 0) });
  if (!r.alreadyExisted) log.info(`whisper model ${model} downloaded`);
}

export function installedModels(): string[] {
  try {
    return readdirSync(modelsDir())
      .filter((f) => /^ggml-.*\.bin$/.test(f))
      .map((f) => f.replace(/^ggml-/, "").replace(/\.bin$/, ""));
  } catch {
    return [];
  }
}

export interface TranscribeOptions {
  wavPath: string;
  model: WhisperModel;
  /** BCP-47-ish code or "auto" */
  language: string;
  normalize?: NormalizeOptions;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** WAV -> id-stamped Words (word-level timestamps, cleaned + monotonic). */
export async function transcribeWav(o: TranscribeOptions): Promise<{ words: Word[]; language: string }> {
  await ensureWhisperBinary();
  const englishOnly = o.model.endsWith(".en");
  const json = await transcribe({
    inputPath: o.wavPath,
    whisperPath: whisperDir(),
    whisperCppVersion: WHISPER_CPP_VERSION,
    model: o.model,
    modelFolder: modelsDir(),
    tokenLevelTimestamps: true,
    language: (englishOnly ? "en" : o.language) as Language,
    printOutput: false,
    signal: o.signal,
    onProgress: (p) => o.onProgress?.(p),
  });
  const { captions } = toCaptions({ whisperCppOutput: json });
  return { words: fromWhisperCaptions(captions, o.normalize), language: json.result?.language ?? (englishOnly ? "en" : o.language) };
}
