// Detects and removes "jumps" in the cumulative energy register: the meter
// sits flat (no consumption recorded) and then suddenly leaps up in a single
// step. Only that step is excluded; energy accumulated after it counts
// normally. Keep the constants in sync with ENERGY_JUMP_* in
// awh_az/backend/main.py's hourly aggregation.

/** Energy must have been unchanged for at least this long before a step can be a jump. */
export const ENERGY_JUMP_FLAT_MIN_S = 10 * 60;
/** Stations draw ~1-1.5kW; a step above this implied power is "sharp". */
export const ENERGY_JUMP_MAX_KW = 3;
/**
 * Steps below this are never jumps. Some stations still upload raw Wh instead
 * of kWh (guides/KNOWN_ISSUES.md #7), where an ordinary step is tens of units,
 * so the floor keeps those from being misread as jumps.
 */
export const ENERGY_JUMP_MIN_KWH = 0.5;

export interface EnergyStep {
  /** Cumulative energy with all detected jumps subtracted out. */
  adjusted: number;
  /** Energy added since the previous valid reading (0 for the first, or for a jump). */
  increment: number;
  isJump: boolean;
}

/** Feed valid energy readings in ascending time order. */
export function createEnergyJumpTracker() {
  let prevE: number | null = null;
  let prevMs = 0;
  let flatSinceMs = 0;
  let offset = 0;

  return function step(e: number, tsMs: number): EnergyStep {
    let increment = 0;
    let isJump = false;
    if (prevE === null) {
      flatSinceMs = tsMs;
    } else {
      const delta = e - prevE;
      if (delta > 0) {
        const flatS = (prevMs - flatSinceMs) / 1000;
        const elapsedH = Math.max(tsMs - prevMs, 0) / 3_600_000;
        const sharp = delta > Math.max(ENERGY_JUMP_MAX_KW * elapsedH, ENERGY_JUMP_MIN_KWH);
        if (flatS >= ENERGY_JUMP_FLAT_MIN_S && sharp) {
          isJump = true;
          offset += delta;
        } else {
          increment = delta;
        }
      }
      if (e !== prevE) flatSinceMs = tsMs;
    }
    prevE = e;
    prevMs = tsMs;
    return { adjusted: e - offset, increment, isJump };
  };
}
