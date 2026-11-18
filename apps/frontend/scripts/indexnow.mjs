// Tells Bing, Yandex, Seznam and Naver (IndexNow) that every URL in the live sitemap is new or changed, so new pages
// are crawled in hours instead of weeks. Google doesn't use IndexNow: it reads the sitemap from Search Console.
//
//   node scripts/indexnow.mjs                 # all sitemap URLs
//   node scripts/indexnow.mjs /styles/glitch  # only these paths
//
// The key file lives at public/<key>.txt and must stay there: IndexNow fetches it to prove we own the host.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SITE = (process.env.APP_URL || "https://www.captionseasy.com").replace(/\/$/, "");
const host = new URL(SITE).host;
const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const keyFile = readdirSync(publicDir).find((f) => /^[a-f0-9]{32}\.txt$/.test(f));
if (!keyFile) throw new Error("no IndexNow key file (32 hex chars .txt) in public/");
const key = readFileSync(join(publicDir, keyFile), "utf8").trim();

let urls = process.argv.slice(2).map((p) => `${SITE}${p.startsWith("/") ? p : `/${p}`}`);
if (!urls.length) {
  const xml = await (await fetch(`${SITE}/sitemap.xml`)).text();
  urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host, key, keyLocation: `${SITE}/${keyFile}`, urlList: urls }),
});
// 200 = accepted, 202 = accepted, key check pending; anything else is a real problem
console.log(`IndexNow ${res.status} for ${urls.length} URL(s)`);
if (res.status !== 200 && res.status !== 202) {
  console.error(await res.text());
  process.exit(1);
}
