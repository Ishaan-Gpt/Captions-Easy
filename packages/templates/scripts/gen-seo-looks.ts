/**
 * Writes the look catalogue the public /styles pages are built from (apps/frontend/src/lib/seo/looks.generated.json).
 * The pages are server-rendered, so they read this plain JSON instead of importing the renderer package.
 * Only looks with a recorded preview (public/looks/<id>.mp4 + .webp) get a page; the rest still appear in the studio.
 *
 *   pnpm --filter @capseasy/templates gen:seo-looks
 */
import { existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LOOKS, LOOK_SECTIONS, lookNumber } from "../src/registry";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const publicLooks = join(root, "apps", "frontend", "public", "looks");
const out = join(root, "apps", "frontend", "src", "lib", "seo", "looks.generated.json");

const sectionOf = new Map<string, string>();
for (const s of LOOK_SECTIONS) for (const id of s.lookIds) sectionOf.set(id, s.label);

const looks = LOOKS.filter((l) => existsSync(join(publicLooks, `${l.id}.mp4`)) && existsSync(join(publicLooks, `${l.id}.webp`))).map((l) => ({
  id: l.id,
  slug: l.id.replace(/_/g, "-"),
  name: l.name,
  number: lookNumber(l.id),
  description: l.description,
  category: l.category,
  section: sectionOf.get(l.id) ?? l.category,
  tags: (l as { tags?: string[] }).tags ?? [],
  font: (l.style as { fontId?: string } | undefined)?.fontId ?? null,
}));

writeFileSync(out, JSON.stringify({ total: LOOKS.length, looks }, null, 1) + "\n");
console.log(`wrote ${looks.length} of ${LOOKS.length} looks to ${out}`);
