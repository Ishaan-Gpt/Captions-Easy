/** Short stable id for words/cards/etc. Works in browsers and Node >= 19. */
export const newId = (): string => globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 12);
