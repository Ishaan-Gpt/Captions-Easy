/**
 * Copy for the public search pages (/styles, /styles/[slug] and the landing pages in LANDINGS).
 * Facts here must match the product and the homepage FAQ: free with no watermark, videos up to 5 minutes on the
 * free plan, speech recognition and export run in the browser, English and Hindi / Hinglish (Roman script),
 * MP4 with burned-in captions or an SRT file, 9:16 and 16:9.
 */
import data from "./looks.generated.json";

export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://www.captionseasy.com").replace(/\/$/, "");

export type SeoLook = (typeof data.looks)[number];
export const SEO_LOOKS: SeoLook[] = data.looks;
export const TOTAL_LOOKS: number = data.total;
export const lookBySlug = (slug: string) => SEO_LOOKS.find((l) => l.slug === slug);
export const lookById = (id: string) => SEO_LOOKS.find((l) => l.id === id);

/** Where each group of looks fits, shown on every style page in that group. */
export const SECTION_COPY: Record<string, { fit: string; bestFor: string }> = {
  Viral: {
    fit: "These looks are made for the first three seconds of a Reel, when a thumb is still deciding whether to stop, so the words glow, slam or stack hard enough to hold the glance long enough for the story to start.",
    bestFor: "hooks, talking-head Reels and Shorts, motivation clips",
  },
  Popular: {
    fit: "These are the looks creators reach for most, the bold boxes and bouncing words you already know from podcast clips and talking-head Shorts, because they keep a fast speaker easy to follow even with the sound off.",
    bestFor: "podcast clips, business and finance Shorts, explainers",
  },
  "Premium motion": {
    fit: "This is motion-designer finishing, the kind that usually takes an evening in After Effects, timed to every word as it is spoken, so a plain clip shot on a phone looks like somebody edited it with care.",
    bestFor: "brand videos, launch clips, cinematic edits, portfolio pieces",
  },
  Trending: {
    fit: "These looks follow what is working on Reels and Shorts right now, with coloured key words, labels and cards that make a line feel designed while staying quick to read on a small screen.",
    bestFor: "lifestyle Reels, tips and lists, product videos",
  },
  Fun: {
    fit: "Playful looks with rounded type and a bit of bounce, for videos where the tone matters as much as the words and you want the captions to smile along with you.",
    bestFor: "vlogs, storytime videos, kids and family content",
  },
  Clean: {
    fit: "Quiet, readable captions that stay out of the way, for videos where the speaker is the show and the captions only need to make every word land.",
    bestFor: "interviews, courses, documentaries, LinkedIn videos",
  },
  Luxury: {
    fit: "Slow, elegant serif type that gives a clip the calm of a fashion film, for when loud captions would cheapen the picture.",
    bestFor: "fashion, beauty, real estate, travel",
  },
  Cinematic: {
    fit: "Tall, spaced-out type that lands one word at a time like a trailer, for clips that should feel big and serious.",
    bestFor: "motivation, trailers, sports edits",
  },
  Retro: {
    fit: "A nod to old tapes and pixel screens, for edits that lean on nostalgia and want the captions in on the joke.",
    bestFor: "music clips, gaming, throwback edits",
  },
  Tech: {
    fit: "Words typed out on a terminal with a blinking cursor, for videos about code, AI and anything that lives on a screen.",
    bestFor: "coding, AI, tech explainers",
  },
  Classic: {
    fit: "Three-line stacks with one hero word, an early CaptionsEasy favourite that still reads beautifully on vertical video.",
    bestFor: "quotes, storytime, short punchy lines",
  },
};

export type Landing = {
  slug: string;
  title: string;
  description: string;
  h1: string;
  lead: string;
  points: { title: string; body: string }[];
  looks: string[];
  faqs: { q: string; a: string }[];
};

const NO_UPLOAD = {
  q: "Is my video uploaded anywhere?",
  a: "No. Speech recognition and the MP4 export both run inside your browser, so the video stays on your device. Only your captions and settings are saved, so you can pick a project up again later.",
};
const FREE = {
  q: "Is it really free?",
  a: "Yes. Captions, every look, the full editor and MP4 and SRT exports are free with no watermark, for videos up to 5 minutes long.",
};

export const LANDINGS: Landing[] = [
  {
    slug: "instagram-reels-captions",
    title: "Instagram Reels Captions, Free & No Watermark | CaptionsEasy",
    description: "Add animated, word-timed captions to Instagram Reels for free. Dozens of styles, placed clear of the Reels buttons, exported with no watermark.",
    h1: "Animated captions for Instagram Reels",
    lead: "Most people watch Reels with the sound off, so the captions are what actually tell your story, and CaptionsEasy times every word to your voice so the line lights up exactly when you say it.",
    points: [
      { title: "Made for 9:16", body: "Reels are vertical, and so is the editor, so you can drag the captions above the like and comment buttons and away from your face before you export." },
      { title: "Looks that stop the scroll", body: "Choose a jumping box, a neon glow or a slow serif wipe, then change the font and colours until the captions feel like your brand rather than a template." },
      { title: "Posts straight to Instagram", body: "You get an MP4 with the captions burned in and no watermark, ready to upload from your phone or your laptop." },
    ],
    looks: ["hormozi_box", "soft_glow", "tri_color_keywords", "moovi_caption_1_1"],
    faqs: [
      { q: "Why not use Instagram's own auto captions?", a: "Instagram's captions are a plain sticker that viewers can turn off, while burned-in animated captions are part of the video, so everyone sees them in the style you chose and they travel with the clip when it is shared or reposted." },
      { q: "Can I keep the captions away from the Reels buttons?", a: "Yes. Drag the caption box anywhere in the frame, and the preview shows exactly where the words will land before you export." },
      FREE,
    ],
  },
  {
    slug: "youtube-shorts-captions",
    title: "YouTube Shorts Captions Generator, Free | CaptionsEasy",
    description: "Auto-generate word-timed, animated captions for YouTube Shorts in your browser. Export an MP4 with burned-in captions or an SRT file, free and with no watermark.",
    h1: "Captions for YouTube Shorts, timed to every word",
    lead: "A Short has about two seconds to earn the next ten, and captions that move with your voice keep viewers reading long after they would have swiped away.",
    points: [
      { title: "Burned in or as a file", body: "Export an MP4 with the captions part of the picture for Shorts, or an SRT file when you would rather upload subtitles to a long-form YouTube video." },
      { title: "Fixed in seconds", body: "If the speech model mishears a name, click the word and type it, and the timing stays locked to your voice." },
      { title: "Nothing to install", body: "Everything runs in the browser on your laptop or phone, so you can caption a Short the moment you finish recording it." },
    ],
    looks: ["beast_bounce", "kinetic_mix", "rgb_split_slam", "explainer"],
    faqs: [
      { q: "Should I burn captions into a Short or upload an SRT?", a: "Burn them in for Shorts, because YouTube's own subtitles are small and many viewers never turn them on. Use the SRT file for long videos, where viewers expect to switch subtitles on and off." },
      FREE,
      NO_UPLOAD,
    ],
  },
  {
    slug: "tiktok-captions",
    title: "TikTok Captions: Word-by-Word, Animated | CaptionsEasy",
    description: "Make word-by-word animated captions for TikTok in your browser. Dozens of styles, English and Hinglish, MP4 export with no watermark.",
    h1: "Word-by-word captions for TikTok",
    lead: "TikTok viewers decide in a heartbeat, and a caption that pops on each word as you say it gives their eyes something to follow while your voice does the convincing.",
    points: [
      { title: "One word at a time, or the whole line", body: "Show a single bouncing word for punchy clips, or keep the full line on screen and light up each word as it is spoken for longer explanations." },
      { title: "Your colours, every time", body: "Save your fonts and colours as a brand kit so every TikTok you caption looks like it came from the same account." },
      { title: "Clear of the side buttons", body: "Place the captions anywhere in the 9:16 frame so the TikTok buttons and caption text never cover them." },
    ],
    looks: ["gradient_pop", "comic_burst", "wave_bounce", "glitch_slice"],
    faqs: [
      { q: "Will TikTok compress the captions?", a: "The captions are drawn into the video itself, so TikTok treats them like any other part of the picture and they come through its compression as clearly as the rest of the frame." },
      FREE,
      NO_UPLOAD,
    ],
  },
  {
    slug: "hinglish-captions",
    title: "Hinglish Captions Generator for Reels & Shorts | CaptionsEasy",
    description: "Auto captions for Hinglish and Hindi videos, written in Roman script the way creators type. A Whisper model fine-tuned for Hindi-English speech, free in your browser.",
    h1: "Hinglish captions that read the way you talk",
    lead: "When you switch between Hindi and English in the same sentence, most caption tools trip over it, but CaptionsEasy uses a speech model fine-tuned on Hindi-English speech and writes the captions in Roman script, the way your audience actually types.",
    points: [
      { title: "Roman script, not a translation", body: "\"Bhai, yeh scene kya hai\" stays exactly that, so your viewers read your words in your voice instead of a stiff English translation." },
      { title: "Fine-tuned for mixed speech", body: "The Whisper model behind it was tuned on Hindi-English speech, so it follows you when a line starts in one language and ends in the other." },
      { title: "Every look works", body: "Pick Hindi / Hinglish when you add your video, then style the captions with any look, exactly as you would an English video." },
    ],
    looks: ["hormozi_box", "tri_color_keywords", "serif_accent_glow", "highlighter_card"],
    faqs: [
      { q: "Does it write Hindi in Devanagari or Roman script?", a: "Captions come out in Roman script (Hinglish), the way most creators and viewers type, so a mixed Hindi-English line reads naturally." },
      { q: "Which languages are supported?", a: "English and Hindi / Hinglish today, with more languages on the way." },
      FREE,
      NO_UPLOAD,
    ],
  },
  {
    slug: "auto-caption-generator",
    title: "Free Auto Caption Generator, No Watermark | CaptionsEasy",
    description: "A free auto caption generator that runs in your browser: word-timed captions, animated styles, MP4 and SRT export, and no upload.",
    h1: "A free auto caption generator that runs in your browser",
    lead: "Drop in a video and CaptionsEasy listens to it on your own device, writes every word with its exact timing, and lets you style and export the captions without a watermark or an upload queue.",
    points: [
      { title: "Accurate word timing", body: "Each word carries its own start and end time, which is what lets the animated looks highlight words in step with your voice." },
      { title: "Private by design", body: "Speech recognition runs in the browser, so your footage stays on your machine and never waits in someone else's server line." },
      { title: "Edit like a document", body: "Fix a misheard word or move a caption, and the preview updates as you go." },
    ],
    looks: ["karaoke_fill", "minimal_pro", "moovi_caption_2", "hormozi_box"],
    faqs: [FREE, NO_UPLOAD, { q: "How long can my video be?", a: "Free videos can be up to 5 minutes long, which covers Reels, Shorts, TikToks and most clips. A Pro plan for longer videos is on the way." }],
  },
  {
    slug: "add-subtitles-to-video",
    title: "Add Subtitles to a Video Online, Free | CaptionsEasy",
    description: "Add subtitles to any video online for free: automatic transcription, easy editing, burned-in MP4 or an SRT file. Works on desktop and phone, nothing to install.",
    h1: "Add subtitles to any video, free and in minutes",
    lead: "Whether you need plain subtitles for a course or bold animated captions for a Reel, you add the video, check the words, pick a look and export, all without installing anything.",
    points: [
      { title: "Plain or animated", body: "Classic film-style subtitles sit quietly at the bottom of the frame, and animated looks put the key words front and centre, so the same tool covers both jobs." },
      { title: "Two ways out", body: "Burn the subtitles into an MP4 so they show everywhere, or download an SRT file for YouTube, LinkedIn, Premiere or CapCut." },
      { title: "Vertical and widescreen", body: "It works with 9:16 Shorts and Reels as well as 16:9 widescreen video." },
    ],
    looks: ["netflix_sub", "read_along", "explainer", "minimal_pro"],
    faqs: [FREE, NO_UPLOAD, { q: "Do I need to install anything?", a: "No. Transcription, editing and MP4 export all run in your browser, on desktop or phone." }],
  },
  {
    slug: "srt-generator",
    title: "SRT Generator: Make an SRT File from Video | CaptionsEasy",
    description: "Make an SRT subtitle file from any video for free: transcribed in your browser, easy to fix, ready for YouTube, Premiere or CapCut.",
    h1: "Make an SRT file from your video",
    lead: "If your editor or platform wants a subtitle file rather than burned-in captions, CaptionsEasy transcribes the video in your browser, lets you fix any word, and gives you a clean .srt to drop wherever you need it.",
    points: [
      { title: "Works everywhere SRT works", body: "Upload it to YouTube or LinkedIn, or import it into Premiere Pro, CapCut, DaVinci Resolve and most other editors." },
      { title: "Timing you can trust", body: "Every line is timed from the speech itself, so the subtitles appear when the words are said rather than drifting a beat behind." },
      { title: "Fix before you download", body: "Correct names and spellings in the editor first, so the file you download is ready to publish." },
    ],
    looks: ["netflix_sub", "read_along", "minimal_pro", "explainer"],
    faqs: [
      { q: "Can I get both an SRT and an MP4?", a: "Yes. Export the SRT file for your editor and an MP4 with burned-in captions from the same project." },
      FREE,
      NO_UPLOAD,
    ],
  },
  {
    slug: "captions-without-watermark",
    title: "Free Video Captions With No Watermark | CaptionsEasy",
    description: "Add animated captions to your videos with no watermark, free. Every caption style and both MP4 and SRT exports are included, and the video stays on your device.",
    h1: "Animated captions with no watermark, free",
    lead: "Plenty of caption apps let you design for free and then stamp their logo on the export, but CaptionsEasy gives you every look and a clean MP4 without a watermark.",
    points: [
      { title: "Every look included", body: "There is no locked shelf of styles, so the jumping boxes, neon glows and premium motion looks are all yours to use." },
      { title: "Clean exports", body: "The MP4 carries your captions and nothing else, so it looks like you made it, because you did." },
      { title: "No upload queue", body: "Rendering happens in your browser, which is how it stays free without a waiting list." },
    ],
    looks: ["moovi_caption_3", "chrome_sweep", "hormozi_box", "neon_duo"],
    faqs: [FREE, NO_UPLOAD],
  },
  {
    slug: "podcast-clip-captions",
    title: "Podcast Clip Captions for Reels & Shorts | CaptionsEasy",
    description: "Caption podcast clips for Reels, Shorts and TikTok with animated, word-timed subtitles. Keep fast talkers easy to follow, free and with no watermark.",
    h1: "Captions for podcast clips that keep up with fast talkers",
    lead: "Podcast clips live or die on one good line, and bold word-timed captions make sure a viewer catches it even when two people are talking quickly over each other.",
    points: [
      { title: "Built for talking heads", body: "Box highlights and dimmed-until-spoken lines guide the eye to the word being said, which is exactly what a fast conversation needs." },
      { title: "Clear of faces", body: "Drag the captions under or beside your guests so the words never sit on anyone's face." },
      { title: "Vertical cuts and widescreen", body: "Caption the 9:16 clip for Reels and Shorts, or the 16:9 version for YouTube and LinkedIn." },
    ],
    looks: ["hormozi_box", "minimal_pro", "read_along", "highlighter_card"],
    faqs: [FREE, NO_UPLOAD],
  },
  {
    slug: "animated-captions",
    title: "Animated Captions Generator, Free | CaptionsEasy",
    description: `Turn speech into animated, kinetic captions in your browser. ${data.total}+ caption looks, from bouncing words to cinematic 3D type, free with no watermark.`,
    h1: "Animated captions that move with your voice",
    lead: "Animated captions give each spoken word its own moment, a pop, a glow or a slam, so the viewer feels the rhythm of what you say even with the sound off.",
    points: [
      { title: "Timed to the word", body: "Motion is driven by the exact timing of each word, so the animation lands on the beat of your speech rather than on a fixed clock." },
      { title: "From playful to cinematic", body: "Choose bouncing cartoon words, editorial serif wipes, chrome and 3D type, or a quiet line that lights up as it is read." },
      { title: "Make it yours", body: "Change fonts, colours, outlines, position and motion, then save it all as a brand kit for next time." },
    ],
    looks: ["kinetic_camera", "flip_3d_type", "letter_cascade", "beast_bounce"],
    faqs: [FREE, NO_UPLOAD],
  },
];

export const landingBySlug = (slug: string) => LANDINGS.find((l) => l.slug === slug);
