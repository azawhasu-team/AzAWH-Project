// Pure window math for touch zoom/pan on the station charts. A window is a
// [start, end] pair of epoch ms; all results are clamped to the data bounds.

export interface TimeWindow {
  start: number;
  end: number;
}

/** Keep `w` inside `bounds`, preserving its span (or shrinking it to fit). */
export function clampWindow(w: TimeWindow, bounds: TimeWindow, minSpan: number): TimeWindow {
  const full = bounds.end - bounds.start;
  const span = Math.min(Math.max(w.end - w.start, Math.min(minSpan, full)), full);
  let start = w.start;
  if (start < bounds.start) start = bounds.start;
  if (start + span > bounds.end) start = bounds.end - span;
  return { start, end: start + span };
}

/** Scale `w` by `factor` (<1 zooms in) keeping the point at `anchor` (0..1 across the window) fixed. */
export function scaleWindow(w: TimeWindow, factor: number, anchor: number, bounds: TimeWindow, minSpan: number): TimeWindow {
  const span = w.end - w.start;
  const anchorMs = w.start + anchor * span;
  const newSpan = span * factor;
  const start = anchorMs - anchor * newSpan;
  return clampWindow({ start, end: start + newSpan }, bounds, minSpan);
}

/** Shift `w` by `fraction` of its own span (positive = later). */
export function panWindow(w: TimeWindow, fraction: number, bounds: TimeWindow, minSpan: number): TimeWindow {
  const shift = (w.end - w.start) * fraction;
  return clampWindow({ start: w.start + shift, end: w.end + shift }, bounds, minSpan);
}

/** True when `w` covers (almost) all of `bounds`, i.e. it is not really zoomed. */
export function isFullWindow(w: TimeWindow, bounds: TimeWindow): boolean {
  return w.end - w.start >= (bounds.end - bounds.start) * 0.999;
}
