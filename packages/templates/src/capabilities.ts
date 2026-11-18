/**
 * What each look's layout really honours of the opt-in per-word levers (measured by capabilities.test.tsx, which
 * renders every look with and without each lever). Word roles compile to these levers, so the API only promises
 * role effects a look will show.
 */
import table from "./looks/capabilities.generated.json";

export interface LookCapabilities {
  levers: {
    /** Word.emphasis "hero" draws it as a key word */
    emphasis: boolean;
    /** Word.color recolours the word */
    color: boolean;
    /** Word.scale resizes the word */
    size: boolean;
    /** Word.entry gives the word its own entrance */
    entry: boolean;
  };
  /** every word is drawn as one unbroken run of text (complex scripts like Devanagari shape correctly) */
  wholeWords: boolean;
}

const CAPS = table as Record<string, LookCapabilities>;
const NONE: LookCapabilities = { levers: { emphasis: false, color: false, size: false, entry: false }, wholeWords: false };

/** A look's measured capabilities (all false for an unknown id). */
export const lookCapabilities = (lookId: string): LookCapabilities => CAPS[lookId] ?? NONE;
