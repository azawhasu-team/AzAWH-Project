// Fleet-level "needs attention" for the stations list. Only stations that are
// supposed to be running (admin status "active") can need attention: the many
// retired stations are permanently "not sending" and would otherwise drown out
// the one that matters. Built from the same alert model as the station page
// (lib/alerts.ts) so the two never disagree.
import { detectPowerStatus } from '@/lib/powerStatus';
import { powerAlerts, reportingAlert, type StationAlert } from '@/lib/alerts';
import { LIVE_MAX_AGE_SECONDS, ONLINE_MAX_AGE_SECONDS } from '@/lib/freshness';

export type AttentionLevel = 'critical' | 'warning' | 'ok';

export interface Attention {
  level: AttentionLevel;
  /** Short reason, e.g. "Station not sending data". Null when ok. */
  reason: string | null;
}

export const OK: Attention = { level: 'ok', reason: null };
const POWER_WINDOW_MS = 24 * 3600_000;

interface PowerReading {
  timestamp: string;
  power?: number | null;
}

export function stationAttention(input: {
  /** Admin status === 'active'. */
  expectedRunning: boolean;
  lastReadingMs: number | null;
  nowMs: number;
  /** Latest readings, only needed (and only fetched) while the station is online. */
  readings?: PowerReading[];
}): Attention {
  if (!input.expectedRunning) return OK;
  const { lastReadingMs, nowMs } = input;
  if (lastReadingMs == null) return { level: 'critical', reason: 'No readings received' };

  const ageSec = Math.max(0, (nowMs - lastReadingMs) / 1000);
  const liveStatus = ageSec < LIVE_MAX_AGE_SECONDS ? 'fresh' : ageSec < ONLINE_MAX_AGE_SECONDS ? 'stale' : 'dead';
  const alerts: StationAlert[] = [...reportingAlert(liveStatus, lastReadingMs, nowMs)];

  if (liveStatus !== 'dead' && input.readings?.length) {
    const series = input.readings
      .filter(r => typeof r.power === 'number')
      .map(r => ({ date: r.timestamp, value: r.power as number }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const newest = series.length ? new Date(series[series.length - 1].date).getTime() : lastReadingMs;
    const recent = series.filter(p => new Date(p.date).getTime() >= newest - POWER_WINDOW_MS);
    if (recent.length > 1) {
      alerts.push(...powerAlerts(detectPowerStatus(recent), newest, () => ''));
    }
  }

  const worst = alerts
    .filter(a => a.active && (a.severity === 'critical' || a.severity === 'warning'))
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1))[0];
  return worst ? { level: worst.severity as AttentionLevel, reason: worst.title } : OK;
}
