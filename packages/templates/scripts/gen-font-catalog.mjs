// Builds src/fontCatalog.generated.json from Google Fonts' public metadata: the most used Latin families with
// their category and upright weights. Nothing is downloaded here: fonts load in the browser when picked.
// Run: node packages/templates/scripts/gen-font-catalog.mjs [count=400]
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const COUNT = Number(process.argv[2] ?? 400);
const CATEGORY = { "Sans Serif": "sans", Serif: "serif", Display: "display", Handwriting: "handwriting", Monospace: "mono" };

const res = await fetch("https://fonts.google.com/metadata/fonts");
if (!res.ok) throw new Error(`metadata: HTTP ${res.status}`);
const { familyMetadataList } = await res.json();

const rows = familyMetadataList
  .filter((f) => f.subsets.includes("latin") && !f.isNoto && !f.isBrandFont && CATEGORY[f.category] && !f.colorCapabilities?.length)
  .sort((a, b) => a.popularity - b.popularity)
  .slice(0, COUNT)
  .map((f) => {
    const weights = Object.keys(f.fonts).filter((k) => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b);
    return [f.family, CATEGORY[f.category], weights.join(",")];
  });

const out = join(dirname(fileURLToPath(import.meta.url)), "../src/fontCatalog.generated.json");
writeFileSync(out, JSON.stringify(rows) + "\n");
console.log(`wrote ${rows.length} families -> ${out}`);
