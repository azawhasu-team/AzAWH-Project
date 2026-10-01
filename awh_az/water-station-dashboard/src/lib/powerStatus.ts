// Flags stretches where the power reading has stopped changing.
//
// A running station's power draw always wobbles a little; a reading that sits
// at the same value for several minutes means the station is off (a steady
// 0 W) or the meter has frozen. Either way someone should look, so those
// stretches are drawn red and the latest one raises an alert.
export const FLAT_POWER_EPSILON_W = 0.05;
export const FLAT_POWER_MIN_MINUTES = 10;

interface PowerPoint {
  date: string;
  value: number | null;
}

export interface FlatPowerRun {
  startMs: number;
  endMs: number;
}

export interface PowerStatus {
  /** date strings of points that belong to a flat run */
  flatDates: Set<string>;
  runs: FlatPowerRun[];
  /** The run that is still ongoing at the newest reading, if any. */
  currentRun: FlatPowerRun | null;
}

export function detectFlatPower(
  data: PowerPoint[],
  minMinutes = FLAT_POWER_MIN_MINUTES,
  epsilon = FLAT_POWER_EPSILON_W
): PowerStatus {
  const flatDates = new Set<string>();
  const runs: FlatPowerRun[] = [];
  const minMs = minMinutes * 60_000;

  let runStart = -1;
  const closeRun = (endIdx: number) => {
    if (runStart < 0) return;
    const startMs = new Date(data[runStart].date).getTime();
    const endMs = new Date(data[endIdx].date).getTime();
    if (endMs - startMs >= minMs) {
      for (let k = runStart; k <= endIdx; k++) flatDates.add(data[k].date);
      runs.push({ startMs, endMs });
    }
    runStart = -1;
  };

  for (let i = 0; i < data.length; i++) {
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
  closeRun(data.length - 1);

  // "Ongoing" = the run reaches the newest point that has a reading.
  let lastIdx = data.length - 1;
  while (lastIdx >= 0 && data[lastIdx].value == null) lastIdx--;
  const lastMs = lastIdx >= 0 ? new Date(data[lastIdx].date).getTime() : NaN;
  const currentRun = runs.length && runs[runs.length - 1].endMs === lastMs ? runs[runs.length - 1] : null;

  return { flatDates, runs, currentRun };
}
