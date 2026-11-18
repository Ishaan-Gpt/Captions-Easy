export type Transcript = { language: string; durationMs: number; words: { id: string; text: string; startMs: number; endMs: number }[] };

const cache = new Map<string, Promise<Transcript>>();

/** One demo transcript, fetched once. A failed fetch (dropped connection, a bot, a page leaving) leaves the demo
 *  without captions instead of an unhandled rejection, and is forgotten so the next mount tries again. */
export function loadTranscript(clip: string): Promise<Transcript | null> {
  let p = cache.get(clip);
  if (!p) {
    p = fetch(`/hero/${clip}.json`).then((r) => {
      if (!r.ok) throw new Error(`hero transcript ${clip}: HTTP ${r.status}`);
      return r.json() as Promise<Transcript>;
    });
    cache.set(clip, p);
  }
  return p.catch(() => {
    if (cache.get(clip) === p) cache.delete(clip);
    return null;
  });
}
