// Flags unusual power behaviour on the power chart:
//  - flat:  the reading stops changing for several minutes (station off at a
//           steady value, or a frozen meter),
//  - zero:  the reading is ~0 W,
//  - jump:  a single step far larger than the recent typical step (a start-up,
//           a trip, a spike).
// "Off" (flat or zero) stretches are drawn red, jumps get an amber marker,
// everything else is green; the newest reading drives the alert banner.
export const FLAT_POWER_EPSILON_W = 0.05;
export const FLAT_POWER_MIN_MINUTES = 10;
export const ZERO_POWER_MAX_W = 0.5;

// A step is a "jump" when it exceeds ALL of: JUMP_TYPICAL_MULT x the 90th
// percentile of the previous JUMP_WINDOW steps (adapts per station), a
// fraction of the level itself, and an absolute floor so meter noise on a
// quiet signal never counts.
export const JUMP_WINDOW = 60;
export const JUMP_MIN_HISTORY = 10;
export const JUMP_TYPICAL_MULT = 4;
export const JUMP_MIN_FRACTION = 0.25;
export const JUMP_MIN_ABS_W = 25;

interface PowerPoint {
  date: string;
  value: number | null;
}

export interface OffStretch {
  startMs: number;
  endMs: number;
  /** true when the stretch reads ~0 W rather than a steady non-zero value */
  atZero: boolean;
}

export interface PowerJump {
  ms: number;
  from: number;
  to: number;
}

export interface PowerStatus {
  /** date strings of points inside an off (flat or zero) stretch */
  offDates: Set<string>;
  /** date strings of points that are a sudden jump */
  jumpDates: Set<string>;
  stretches: OffStretch[];
  jumps: PowerJump[];
  /** The off stretch that is still ongoing at the newest reading, if any. */
  currentStretch: OffStretch | null;
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1) + 0.5))];
}

export function detectPowerStatus(
  data: PowerPoint[],
  minFlatMinutes = FLAT_POWER_MIN_MINUTES,
  epsilon = FLAT_POWER_EPSILON_W
): PowerStatus {
  const n = data.length;
  const off = new Array<boolean>(n).fill(false);
  const minMs = minFlatMinutes * 60_000;
  const ms = data.map(d => new Date(d.date).getTime());

  // zero readings, any duration
  for (let i = 0; i < n; i++) {
    const v = data[i].value;
    if (v != null && v <= ZERO_POWER_MAX_W) off[i] = true;
  }

  // flat runs: consecutive readings within epsilon for >= minFlatMinutes
  let runStart = -1;
  const closeRun = (endIdx: number) => {
    if (runStart >= 0 && ms[endIdx] - ms[runStart] >= minMs) {
      for (let k = runStart; k <= endIdx; k++) off[k] = true;
    }
    runStart = -1;
  };
  for (let i = 0; i < n; i++) {
    const v = data[i].value;
    if (v == null) {
      closeRun(i - 1);
      continue;
    }
    if (runStart < 0) {
      runStart = i;
    } else {
      const prev = data[i - 1].value;
      if (prev == null || Math.abs(v - prev) > epsilon) {
        closeRun(i - 1);
        runStart = i;
      }
    }
  }
  closeRun(n - 1);

  // sudden jumps
  const jumpDates = new Set<string>();
  const jumps: PowerJump[] = [];
  const steps: number[] = []; // |Δ| of consecutive valid readings, trailing window
  for (let i = 1; i < n; i++) {
    const v = data[i].value;
    const prev = data[i - 1].value;
    if (v == null || prev == null) continue;
    const step = Math.abs(v - prev);
    if (steps.length >= JUMP_MIN_HISTORY) {
      const typical = percentile([...steps].sort((a, b) => a - b), 0.9);
      const threshold = Math.max(
        JUMP_TYPICAL_MULT * typical,
        JUMP_MIN_FRACTION * Math.max(Math.abs(prev), Math.abs(v)),
        JUMP_MIN_ABS_W
      );
      if (step > threshold) {
        jumpDates.add(data[i].date);
        jumps.push({ ms: ms[i], from: prev, to: v });
      }
    }
    steps.push(step);
    if (steps.length > JUMP_WINDOW) steps.shift();
  }

  // contiguous off stretches
  const offDates = new Set<string>();
  const stretches: OffStretch[] = [];
  for (let i = 0; i < n; ) {
    if (!off[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < n && off[j + 1]) j++;
    for (let k = i; k <= j; k++) offDates.add(data[k].date);
    stretches.push({ startMs: ms[i], endMs: ms[j], atZero: (data[j].value ?? 1) <= ZERO_POWER_MAX_W });
    i = j + 1;
  }

  let lastIdx = n - 1;
  while (lastIdx >= 0 && data[lastIdx].value == null) lastIdx--;
  const lastMs = lastIdx >= 0 ? ms[lastIdx] : NaN;
  const last = stretches[stretches.length - 1];
  const currentStretch = last && last.endMs === lastMs ? last : null;

  return { offDates, jumpDates, stretches, jumps, currentStretch };
}
