// Min/max-preserving downsampling for time-series charts.
//
// Keeping every Nth point (the obvious approach) can silently drop the one
// reading that matters — a sharp spike or dip is exactly what a monitoring
// chart exists to show. This instead splits the series into buckets and keeps
// each bucket's extremes (and a gap marker for real outages), so peaks always
// survive. Isolated missing readings are NOT kept as gaps: a sensor that drops
// a sample now and then would otherwise chop the line into fragments at every
// bucket; only a run of MIN_GAP_RUN consecutive missing readings counts as an
// outage worth showing.
const MIN_GAP_RUN = 5;

interface Point {
  value: number | null;
  value2?: number | null;
}

export function downsampleMinMax<T extends Point>(data: T[], maxPoints: number): T[] {
  const n = data.length;
  if (n <= maxPoints || maxPoints < 8) return data;

  const PER_BUCKET = 5; // min, max, min2, max2, first null
  const bucketCount = Math.floor((maxPoints - 2) / PER_BUCKET);
  const interior = n - 2; // first and last points are always kept
  const keep = new Set<number>([0, n - 1]);

  // runLen[i] = length of the run of consecutive nulls that index i belongs to
  const runLen = new Array<number>(n).fill(0);
  for (let i = 0; i < n; ) {
    if (data[i].value != null) { i++; continue; }
    let j = i;
    while (j < n && data[j].value == null) j++;
    for (let k = i; k < j; k++) runLen[k] = j - i;
    i = j;
  }

  for (let b = 0; b < bucketCount; b++) {
    const from = 1 + Math.floor((b * interior) / bucketCount);
    const to = 1 + Math.floor(((b + 1) * interior) / bucketCount); // exclusive

    let minI = -1, maxI = -1, min2I = -1, max2I = -1, nullI = -1;
    for (let i = from; i < to; i++) {
      const v = data[i].value;
      if (v == null) {
        if (nullI < 0 && runLen[i] >= MIN_GAP_RUN) nullI = i; // a real outage must not be bridged by the line
      } else {
        if (minI < 0 || v < (data[minI].value as number)) minI = i;
        if (maxI < 0 || v > (data[maxI].value as number)) maxI = i;
      }
      const v2 = data[i].value2;
      if (v2 != null) {
        if (min2I < 0 || v2 < (data[min2I].value2 as number)) min2I = i;
        if (max2I < 0 || v2 > (data[max2I].value2 as number)) max2I = i;
      }
    }
    for (const i of [minI, maxI, min2I, max2I, nullI]) if (i >= 0) keep.add(i);
  }

  return [...keep].sort((a, b) => a - b).map(i => data[i]);
}
