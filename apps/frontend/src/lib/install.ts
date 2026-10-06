/**
 * The one-line Companion install commands shown in the app. The Windows form runs anywhere (PowerShell, Command
 * Prompt, Win+R) and bypasses the default "running scripts is disabled" policy for that one process only.
 */
export const windowsInstall = (origin: string) =>
  `powershell -NoProfile -ExecutionPolicy Bypass -Command "irm ${origin}/install.ps1 | iex"`;
export const macInstall = (origin: string) => `curl -fsSL ${origin}/install.sh | bash`;
