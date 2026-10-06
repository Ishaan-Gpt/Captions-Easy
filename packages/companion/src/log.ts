import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { dirs } from "./config";

let ready = false;
const line = (level: string, msg: string) => `${new Date().toISOString()} ${level.padEnd(5)} ${msg}`;

function write(level: string, msg: string) {
  const l = line(level, msg);
  (level === "error" ? console.error : console.log)(l);
  try {
    if (!ready) {
      mkdirSync(dirs.logs, { recursive: true });
      ready = true;
    }
    appendFileSync(join(dirs.logs, "companion.log"), l + "\n");
  } catch {
    /* logging must never crash the worker */
  }
}

export const log = {
  info: (m: string) => write("info", m),
  warn: (m: string) => write("warn", m),
  error: (m: string) => write("error", m),
};
