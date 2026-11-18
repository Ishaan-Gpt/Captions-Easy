/**
 * Browsers' H.264 encoders stop at about 4K. An 8K source exported at its own size fails with "This specific encoder
 * configuration (avc1.64003c, ... 7680x4320) is not supported" (Sentry SENTRY-COPPER-QUEEN-1C / -1D), so the
 * in-browser MP4 is scaled down to fit UHD: at most 3840 px on the long edge and 2160 px on the short edge.
 */
export const MAX_EXPORT_LONG_EDGE = 3840;
export const MAX_EXPORT_SHORT_EDGE = 2160;

/** Output size for the in-browser MP4: the chosen short edge (e.g. 1080), or the source, then capped to what
 *  browsers can encode. Even dimensions (H.264). `scale` is output width / source width (1 = unchanged). */
export function browserExportSize(width: number, height: number, shortEdge?: number): { width: number; height: number; scale: number } {
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  let k = shortEdge && short > shortEdge ? shortEdge / short : 1;
  k = Math.min(k, MAX_EXPORT_LONG_EDGE / long, MAX_EXPORT_SHORT_EDGE / short);
  if (k >= 1) return { width, height, scale: 1 };
  const even = (n: number) => Math.max(2, Math.floor((n * k) / 2) * 2);
  const w = even(width);
  return { width: w, height: even(height), scale: w / width };
}
