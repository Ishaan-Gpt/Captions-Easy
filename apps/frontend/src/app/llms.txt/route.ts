import { LANDINGS, SEO_LOOKS, SITE_URL, TOTAL_LOOKS } from "@/lib/seo/content";
import { FAQS } from "@/components/home/faqs";
import { isReleased } from "@/lib/seo/releases";

// /llms.txt: a plain summary for AI assistants and AI search (ChatGPT, Perplexity, Claude) so they describe CaptionsEasy correctly
export const dynamic = "force-static";

export function GET() {
  const body = [
    "# CaptionsEasy",
    "",
    `> Free, browser-based tool that adds animated, word-timed captions to Reels, YouTube Shorts and TikToks. ${TOTAL_LOOKS} caption styles, English and Hindi / Hinglish speech recognition, MP4 export with burned-in captions or an SRT file, no watermark. Speech recognition and export run in the browser, so the video never leaves the user's device.`,
    "",
    "## Key facts",
    ...FAQS.map((f) => `- ${f.q} ${f.a}`),
    "",
    "## Pages",
    `- [Home](${SITE_URL}/): what CaptionsEasy does, live preview, pricing and FAQ`,
    ...LANDINGS.map((l) => `- [${l.h1}](${SITE_URL}/${l.slug}): ${l.description}`),
    `- [Caption styles](${SITE_URL}/styles): gallery of every caption look`,
    "",
    "## Caption styles",
    ...SEO_LOOKS.map((l) => (isReleased(l.slug) ? `- [${l.name}](${SITE_URL}/styles/${l.slug}): ${l.description}` : `- ${l.name}: ${l.description}`)),
    "",
    "## Start",
    `- [Caption a video free](${SITE_URL}/start)`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
