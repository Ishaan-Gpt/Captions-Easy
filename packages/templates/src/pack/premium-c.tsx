/**
 * Pack: premium motion looks, part C. Wired in through ./index.ts.
 * Editorial 3D Stack: an editorial lockup (heavy caps, a glowing key word, light serif connectors) built line by line
 * in a perspective-projected 3D plane, each new line landing in front of the last. Layout: ./premium-c-stack.tsx.
 */
import type { LookSeed } from "../looks/new";
import type { TemplateDefinition } from "../types";
import { EditorialStackLayout, STACK_SERIF } from "./premium-c-stack";
import { NO_EXIT, OWN_ENTRANCE, premiumCaps } from "./premium-b-kit";

/** a dark contact shadow under every word: where a line overlaps the one behind it, it shades it */
const DEPTH_SHADOWS = [{ x: 0, y: 7, blur: 16, color: "rgba(0,0,0,0.55)" }, { x: 0, y: 2, blur: 3, color: "rgba(0,0,0,0.45)" }];

export const PREMIUM_C_TEMPLATES: TemplateDefinition[] = [
  {
    id: "pack_editorial_3d_stack", name: "Editorial Depth Stack",
    description: "An editorial lockup built in 3D as it is spoken: heavy caps, a glowing key word and light serif connectors, each new line flying in letter by letter and landing in front of the last",
    layout: "pack-editorial-3d-stack",
    defaults: {
      fontId: "Archivo Black", fontWeight: 400, fontSize: 132, casing: "upper", letterSpacing: -3, lineHeight: 0.8, maxWidth: 0.8, position: { x: 0.5, y: 0.54 },
      fill: { type: "solid", color: "#FFFFFF" }, shadows: DEPTH_SHADOWS, glow: { enabled: true, color: "#FFC21A", radius: 26, intensity: 0.75 },
      active: { effect: "none", color: "#FFD60A", scale: 1, boxRadius: 12 }, entrance: OWN_ENTRANCE, exit: NO_EXIT,
    },
    settingsDefaults: { maxWordsPerCard: 6, maxLines: 3 },
    capabilities: premiumCaps({ hero: true, weight: false }), fixedWordsPerCard: 6, fonts: ["Archivo Black", STACK_SERIF], Page: EditorialStackLayout,
  },
];

export const PREMIUM_C_LOOKS: LookSeed[] = [
  { id: "editorial_3d_stack", name: "Editorial Depth Stack", description: "Heavy caps, a glowing yellow key word and light serif connectors stack in 3D as they are spoken, each line flying in letter by letter in front of the last", category: "Premium", templateId: "pack_editorial_3d_stack",
    tags: ["3D stack", "Serif mix", "Caps"], style: {}, settings: { maxWordsPerCard: 6, maxLines: 3 } },
];
