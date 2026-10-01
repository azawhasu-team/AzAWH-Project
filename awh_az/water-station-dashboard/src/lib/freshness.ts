// One freshness vocabulary for the whole app: how recently a station last
// reported. Thresholds match the station detail page's Live Status widget.

export interface Freshness {
  label: 'Live' | 'Delayed' | 'Not sending' | 'Waiting for data';
  color: string;
  ageSec?: number;
}

export const LIVE_MAX_AGE_SECONDS = 120;
export const ONLINE_MAX_AGE_SECONDS = 15 * 60;

export function freshnessOf(lastReading: string | null | undefined, nowMs: number = Date.now()): Freshness {
  if (!lastReading) return { label: 'Waiting for data', color: '#9e9e9e' };
  const ageSec = Math.max(0, (nowMs - new Date(lastReading).getTime()) / 1000);
  if (ageSec < LIVE_MAX_AGE_SECONDS) return { label: 'Live', color: '#2e7d32', ageSec };
  if (ageSec < ONLINE_MAX_AGE_SECONDS) return { label: 'Delayed', color: '#ed6c02', ageSec };
  return { label: 'Not sending', color: '#c62828', ageSec };
}

/** Keep a station online through a short interruption; 15 minutes without a reading is offline. */
export function isStationOnline(lastReading: string | null | undefined, nowMs: number = Date.now()): boolean {
  if (!lastReading) return false;
  const ageSec = Math.max(0, (nowMs - new Date(lastReading).getTime()) / 1000);
  return ageSec < ONLINE_MAX_AGE_SECONDS;
}

export function formatAge(ageSec: number | undefined): string {
  if (ageSec == null) return '';
  if (ageSec < 60) return `${Math.floor(ageSec)}s ago`;
  if (ageSec < 3600) return `${Math.floor(ageSec / 60)}m ago`;
  if (ageSec < 86400) return `${Math.floor(ageSec / 3600)}h ago`;
  return `${Math.floor(ageSec / 86400)}d ago`;
}
