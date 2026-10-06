import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import envPaths from "env-paths";

const paths = envPaths("capseasy", { suffix: "" });

export const dirs = {
  config: paths.config,
  cache: process.env.CAPSEASY_CACHE ?? paths.cache,
  data: process.env.CAPSEASY_DATA ?? paths.data,
  logs: paths.log,
};

export interface Config {
  apiBase: string;
  workerId?: string;
  token?: string;
  workerName?: string;
  whisperModel: string;
}

const file = () => join(process.env.CAPSEASY_CONFIG ?? dirs.config, "config.json");

export const DEFAULT_API = process.env.CAPSEASY_API ?? "https://captionseasy.vercel.app";

export function ensureDirs() {
  for (const d of [dirs.config, dirs.cache, dirs.data, dirs.logs]) mkdirSync(d, { recursive: true });
}

export function loadConfig(): Config {
  const base: Config = { apiBase: DEFAULT_API, whisperModel: "small" };
  try {
    if (existsSync(file())) return { ...base, ...JSON.parse(readFileSync(file(), "utf8")) };
  } catch {
    /* corrupt config: fall back to defaults; the user can `capseasy login` again */
  }
  return base;
}

export function saveConfig(cfg: Config) {
  mkdirSync(process.env.CAPSEASY_CONFIG ?? dirs.config, { recursive: true });
  writeFileSync(file(), JSON.stringify(cfg, null, 2), { mode: 0o600 });
  try {
    chmodSync(file(), 0o600); // no-op on Windows; keeps the token private on macOS/Linux
  } catch {
    /* ignore */
  }
}
