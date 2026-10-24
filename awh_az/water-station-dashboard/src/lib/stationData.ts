// Decides whether a station can possibly have readings in a window, so pages
// don't request hourly data the backend would only answer with a 404.
import type { StationInfo } from '@/lib/api-client';

/**
 * False only when we KNOW the station stopped reporting before the window
 * began (or never reported). An unparseable timestamp is treated as "maybe",
 * so a data glitch never hides a station.
 */
export function mayHaveDataSince(
  station: Pick<StationInfo, 'metadata'>,
  startISO?: string | null
): boolean {
  const last = station.metadata?.last_reading;
  if (!last) return false;
  if (!startISO) return true;
  const lastMs = Date.parse(last);
  const startMs = Date.parse(startISO);
  if (Number.isNaN(lastMs) || Number.isNaN(startMs)) return true;
  return lastMs >= startMs;
}
