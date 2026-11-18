/**
 * Staged release of the /styles/<look> pages.
 *
 * Every style page is built and reachable (the gallery and landing pages link to it), but a page is only offered to
 * search engines once it has its own write-up here. Until then it carries `noindex, follow` and stays out of the
 * sitemap and llms.txt, so Google never sees a batch of near-identical template pages (its "scaled content" policy
 * judges the whole site by pages like that).
 *
 * To release a wave (5-10 a week, most-searched first; see docs/launch/STYLE-RELEASES.md):
 *   1. add an entry below for each look, written fresh (no sentence shared with another entry)
 *   2. bump CONTENT_UPDATED in app/sitemap.ts, deploy
 *   3. `npm run indexnow -- /styles/<slug> ...` and request indexing for each URL in Search Console
 */
export type StyleRelease = {
  /** day the page went into the sitemap (YYYY-MM-DD) */
  released: string;
  /** what people actually type for this look, if it differs from our name ("Hormozi captions" for Jumping Box) */
  searchName?: string;
  /** 2-3 sentences: what this look does to a viewer, in plain words */
  intro: string;
  /** who uses it and on what kind of video, concretely */
  whoUses: string;
  /** when to pick something else, and which look instead (a slug from this list or the gallery) */
  avoid: { when: string; instead: string };
  /** one practical tip for getting it right (placement, words per line, colour) */
  tip: string;
};

/**
 * Released pages. Empty on purpose (2026-11-18): Ishaan is redoing the looks by hand, so no style page goes to search
 * until its look is final, its preview (public/looks/<id>.mp4 + .webp) is re-recorded and its write-up matches it.
 */
export const STYLE_RELEASES: Record<string, StyleRelease> = {};

/**
 * Drafts written for the current looks, waiting for the redone versions. Re-check every fact against the new look
 * (font, colours, words per card, motion) before moving an entry into STYLE_RELEASES with a new `released` date.
 */
export const STYLE_DRAFTS: Record<string, StyleRelease> = {
  // wave 1 candidates: looks people already search for by name, where small caption tools rank in the top 10
  "hormozi-box": {
    released: "2026-11-18",
    searchName: "Hormozi Style Captions",
    intro:
      "Hormozi style captions are the thick white capitals with a bright box that jumps from word to word, the look that made fast business clips easy to follow and that countless short-form creators have borrowed since.",
    whoUses:
      "Coaches, founders, finance creators and anyone clipping a podcast use it, because when someone talks fast and makes a point every few seconds, a box landing on each word drags the viewer's eye along with the argument even when the sound is off. Ours sets Montserrat Black in capitals with a green box, keeps three words or fewer on screen at once, and moves the box on the exact moment each word is said.",
    avoid: {
      when: "It shouts, which is the point, so on a calm vlog, a recipe or anything gentle it can feel like someone is yelling over your footage.",
      instead: "minimal-pro",
    },
    tip: "Keep it to three words a card so the box has room to travel, and park the captions in the lower third, above the platform buttons and clear of the speaker's chin. Swap the green for your brand colour in the Style panel if green clashes with your shirt.",
  },
  "beast-bounce": {
    released: "2026-11-18",
    searchName: "MrBeast Style Captions",
    intro:
      "MrBeast style captions throw one chunky yellow word at a time onto the screen, tilted and dropped with a hard black shadow, so every word lands like a small punch and the video never feels still.",
    whoUses:
      "Challenge channels, gaming creators, reaction videos and anyone whose edit runs on energy reach for it, since a single bouncing word is readable at a glance on a phone and keeps something moving between cuts. Ours uses the Luckiest Guy cartoon font in capitals, a thick outline, a hard drop shadow and a slight alternating tilt, one word per card.",
    avoid: {
      when: "One word at a time is tiring to read through a long explanation or a sad, serious moment, where the bounce works against what you are saying.",
      instead: "read-along",
    },
    tip: "It hits hardest on short sentences said quickly, so trim the pauses out of your clip first; long gaps leave a single word sitting on screen and the energy drops.",
  },
  "netflix-sub": {
    released: "2026-11-18",
    searchName: "Netflix-Style Subtitles",
    intro:
      "Netflix-style subtitles are the quiet white lines at the bottom of the frame with a soft shadow and no motion at all, the kind you stop noticing a minute into a film because they simply let you follow the words.",
    whoUses:
      "Short films, interviews, documentaries, travel edits and anyone translating their own videos use them, because the picture stays the star and the subtitles only carry the meaning. Ours places clean white text with a soft shadow low in the frame, line by line in step with the speech, and you can export the same lines as an SRT file for YouTube or your editor.",
    avoid: {
      when: "On a Reel or Short that has to stop a scroll in the first second, still subtitles are easy to swipe past, because nothing in them pulls the eye.",
      instead: "hormozi-box",
    },
    tip: "Keep each line under about 40 characters and two lines at most, so a viewer reads it in one glance; if a sentence runs longer, split it where you naturally take a breath.",
  },
  "chat-bubble": {
    released: "2026-11-18",
    searchName: "Text Message Style Captions",
    intro:
      "Text message style captions turn what you say into blue chat bubbles that pop up one after another, so a story told to camera reads like a conversation scrolling past on a phone.",
    whoUses:
      "Storytime creators, relationship and dating content, comedy sketches and anyone retelling a chat use it, because the bubble format makes viewers feel they are reading something private, and that is very hard to scroll away from.",
    avoid: {
      when: "It turns everything into a conversation, so for a tutorial, a product demo or a speech it adds a joke the video did not ask for.",
      instead: "explainer",
    },
    tip: "Short lines work best because they look like real texts, so set fewer words per card and let each thought become its own bubble.",
  },
  "glitch-slice": {
    released: "2026-11-18",
    searchName: "Glitch Captions",
    intro:
      "Glitch captions tear onto the screen as sliced, colour-split frames, snap clean for a moment so you can read them, and then tear again on the key word as it is spoken, like a signal fighting to come through.",
    whoUses:
      "Tech and AI channels, gaming edits, music videos and anything with a dark, digital mood use it, because the tear gives each line a jolt of tension without hiding the words for more than a few frames.",
    avoid: {
      when: "The tearing reads as tension, so on a warm, friendly video or anything for kids it sends the wrong feeling.",
      instead: "wave-bounce",
    },
    tip: "It looks best over darker footage where the red and cyan split can glow, and it rewards a confident, punchy read, so pick lines with one clear key word for the second tear to land on.",
  },
};

export const releaseFor = (slug: string): StyleRelease | undefined => STYLE_RELEASES[slug];
export const isReleased = (slug: string) => slug in STYLE_RELEASES;
