// Decides whether a station is currently ON or OFF from its cumulative energy
// register: if it moved by less than STATION_OFF_ENERGY_KWH over the last
// hour, the station is off. Keep the threshold in sync with
// ENERGY_NOISE_FLOOR_KWH in awh_az/backend/main.py's hourly aggregation, which
// excludes such hours from energy and specific energy consumption.
import { createEnergyJumpTracker } from '@/lib/energyJumps';

export const STATION_OFF_ENERGY_KWH = 0.2;
export const STATION_POWER_WINDOW_MS = 60 * 60 * 1000;
/** Need readings spanning at least this much of the window to call it either way. */
const MIN_SPAN_MS = 30 * 60 * 1000;
/** Same Wh-vs-kWh heuristic as the backend (ENERGY_WH_HEURISTIC_THRESHOLD_KWH). */
const WH_HEURISTIC_THRESHOLD = 20;

export type StationPowerState = 'on' | 'off' | 'unknown';

interface EnergyReading {
  timestamp: string;
  energy?: number | null;
}

/** Readings may arrive in any order; only the last hour before the newest one is used. */
export function stationPowerState(readings: EnergyReading[]): StationPowerState {
  const pts = readings
    .filter((r): r is { timestamp: string; energy: number } => typeof r.energy === 'number')
    .map(r => ({ ms: new Date(r.timestamp).getTime(), e: r.energy }))
    .filter(p => Number.isFinite(p.ms))
    .sort((a, b) => a.ms - b.ms);
  if (pts.length < 2) return 'unknown';

  const newest = pts[pts.length - 1].ms;
  const windowPts = pts.filter(p => p.ms >= newest - STATION_POWER_WINDOW_MS);
  if (windowPts.length < 2) return 'unknown';
  if (windowPts[windowPts.length - 1].ms - windowPts[0].ms < MIN_SPAN_MS) return 'unknown';

  // Seed the jump tracker with the flat stretch before the window so a jump
  // right at the start of the window isn't counted as consumption.
  const step = createEnergyJumpTracker();
  for (const p of pts) {
    if (p.ms >= windowPts[0].ms) break;
    step(p.e, p.ms);
  }
  let total = 0;
  for (const p of windowPts) total += step(p.e, p.ms).increment;
  if (total > WH_HEURISTIC_THRESHOLD) total /= 1000;
  return total < STATION_OFF_ENERGY_KWH ? 'off' : 'on';
}
