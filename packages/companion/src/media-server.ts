import { createReadStream, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { basename } from "node:path";

const MIME: Record<string, string> = { mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska" };

/**
 * Localhost-only file server with HTTP range support, so Remotion's <OffthreadVideo> reads the cached file
 * instead of re-downloading it from the internet for every frame.
 */
export async function serveFile(filePath: string): Promise<{ url: string; close: () => Promise<void> }> {
  const size = statSync(filePath).size;
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "mp4";
  const type = MIME[ext] ?? "application/octet-stream";

  const server: Server = createServer((req, res) => {
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
    let start = 0;
    let end = size - 1;
    if (range) {
      if (range[1]) start = Number(range[1]);
      if (range[2]) end = Math.min(size - 1, Number(range[2]));
      if (!range[1] && range[2]) {
        start = Math.max(0, size - Number(range[2]));
        end = size - 1;
      }
      if (start > end || start >= size) {
        res.writeHead(416, { "content-range": `bytes */${size}` }).end();
        return;
      }
      res.writeHead(206, { "content-range": `bytes ${start}-${end}/${size}`, "accept-ranges": "bytes", "content-length": end - start + 1, "content-type": type, "access-control-allow-origin": "*" });
    } else {
      res.writeHead(200, { "accept-ranges": "bytes", "content-length": size, "content-type": type, "access-control-allow-origin": "*" });
    }
    if (req.method === "HEAD") return void res.end();
    createReadStream(filePath, { start, end }).on("error", () => res.destroy()).pipe(res);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/${encodeURIComponent(basename(filePath))}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
