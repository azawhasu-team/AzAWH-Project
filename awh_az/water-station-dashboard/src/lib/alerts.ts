// One alert model for the station page. The separate detectors (reporting
// freshness, on/off, power-chart status, model-flagged activity) each produce
// StationAlert values; the alerts panel only renders these.
//
// False-alarm handling lives here:
//  - power jumps next to an off-stretch edge are start-ups/shutdowns, not faults,
//  - jumps close together are merged into one "unstable power" alert,
//  - severity is graded (critical / warning / info) rather than everything amber.
import type { PowerStatus, PowerJump, OffStretch } from '@/lib/powerStatus';
import { RECENT_JUMP_WINDOW_MIN } from '@/lib/powerStatus';
import type { AnomalyInterval } from '@/lib/anomalies';

export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertType =
  | 'not_reporting'
  | 'delayed'
  | 'station_off'
  | 'power_stuck'
  | 'power_zero'
  | 'power_unstable'
  | 'unusual_activity';

export interface StationAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  detail: string;
  startMs: number;
  endMs: number;
  /** Still happening at the newest reading. */
  active: boolean;
}

/** A jump this close to the edge of an off stretch is a start-up/shutdown, so expected. */
export const EXPECTED_JUMP_MARGIN_MS = 15 * 60_000;
/** Jumps closer together than this are one alert. */
export const JUMP_CLUSTER_GAP_MS = 10 * 60_000;
/** A cluster with at least this many jumps is a warning even once it has passed. */
export const UNSTABLE_WARNING_MIN_JUMPS = 3;
/** Alerts that ended longer ago than this (before the newest reading) are not "recent". */
export const RECENT_ALERT_WINDOW_MS = 24 * 3600_000;

const SEVERITY_RANK: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

export function formatAlertDuration(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'under a minute';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m ? `${h} h ${m} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} d ${h % 24} h`;
}

/** Jumps with start-up/shutdown jumps removed, merged into clusters. */
export function clusterJumps(jumps: PowerJump[], stretches: OffStretch[]): PowerJump[][] {
  const unexpected = jumps.filter(
    j =>
      !stretches.some(
        s =>
          Math.abs(j.ms - s.startMs) <= EXPECTED_JUMP_MARGIN_MS ||
          Math.abs(j.ms - s.endMs) <= EXPECTED_JUMP_MARGIN_MS
      )
  );
  const clusters: PowerJump[][] = [];
  for (const j of unexpected) {
    const last = clusters[clusters.length - 1];
    if (last && j.ms - last[last.length - 1].ms <= JUMP_CLUSTER_GAP_MS) last.push(j);
    else clusters.push([j]);
  }
  return clusters;
}

export function reportingAlert(
  liveStatus: 'fresh' | 'stale' | 'dead' | 'unknown',
  lastReadingMs: number | null,
  nowMs: number
): StationAlert[] {
  if (liveStatus === 'dead' && lastReadingMs != null) {
    return [{
      id: `not_reporting-${lastReadingMs}`,
      type: 'not_reporting',
      severity: 'critical',
      title: 'Station not sending data',
      detail: `No reading for ${formatAlertDuration(nowMs - lastReadingMs)}.`,
      startMs: lastReadingMs,
      endMs: nowMs,
      active: true,
    }];
  }
  if (liveStatus === 'stale' && lastReadingMs != null) {
    return [{
      id: `delayed-${lastReadingMs}`,
      type: 'delayed',
      severity: 'warning',
      title: 'Readings are delayed',
      detail: `Last reading ${formatAlertDuration(nowMs - lastReadingMs)} ago.`,
      startMs: lastReadingMs,
      endMs: nowMs,
      active: true,
    }];
  }
  return [];
}

export function stationOffAlert(isOff: boolean, nowMs: number): StationAlert[] {
  if (!isOff) return [];
  return [{
    id: 'station_off-now',
    type: 'station_off',
    severity: 'info',
    title: 'Station is off',
    detail: 'Reporting, but used under 0.2 kWh in the last hour.',
    startMs: nowMs,
    endMs: nowMs,
    active: true,
  }];
}

export function powerAlerts(status: PowerStatus, lastMs: number, fmtTime: (ms: number) => string): StationAlert[] {
  const out: StationAlert[] = [];

  for (const s of status.stretches) {
    const isCurrent = status.currentStretch === s;
    const dur = formatAlertDuration(s.endMs - s.startMs);
    if (s.atZero) {
      out.push({
        id: `power_zero-${s.startMs}`,
        type: 'power_zero',
        severity: isCurrent ? 'warning' : 'info',
        title: isCurrent ? 'Power reads 0 W (station may be off)' : 'Power read 0 W',
        detail: `Since ${fmtTime(s.startMs)} (${dur}).`,
        startMs: s.startMs,
        endMs: s.endMs,
        active: isCurrent,
      });
    } else {
      out.push({
        id: `power_stuck-${s.startMs}`,
        type: 'power_stuck',
        severity: isCurrent ? 'warning' : 'info',
        title: isCurrent ? 'Power is not changing (meter may be stuck)' : 'Power stopped changing for a while',
        detail: `Unchanged since ${fmtTime(s.startMs)} (${dur}).`,
        startMs: s.startMs,
        endMs: s.endMs,
        active: isCurrent,
      });
    }
  }

  const recentCutoff = lastMs - RECENT_JUMP_WINDOW_MIN * 60_000;
  for (const c of clusterJumps(status.jumps, status.stretches)) {
    const first = c[0];
    const last = c[c.length - 1];
    const active = last.ms >= recentCutoff;
    const many = c.length >= UNSTABLE_WARNING_MIN_JUMPS;
    out.push({
      id: `power_unstable-${first.ms}`,
      type: 'power_unstable',
      severity: active || many ? 'warning' : 'info',
      title: c.length === 1 ? 'Sudden power change' : `Unstable power (${c.length} sudden changes)`,
      detail:
        c.length === 1
          ? `${first.from.toFixed(0)} W → ${first.to.toFixed(0)} W at ${fmtTime(first.ms)}.`
          : `${fmtTime(first.ms)} to ${fmtTime(last.ms)}; latest ${last.from.toFixed(0)} W → ${last.to.toFixed(0)} W.`,
      startMs: first.ms,
      endMs: last.ms,
      active,
    });
  }
  return out;
}

export function anomalyAlerts(intervals: AnomalyInterval[]): StationAlert[] {
  return intervals.map(iv => {
    const startMs = new Date(iv.start).getTime();
    return {
      id: `unusual_activity-${startMs}`,
      type: 'unusual_activity' as const,
      severity: 'info' as const,
      title: iv.summary ?? 'Unusual activity',
      detail: `Model-flagged (${iv.parameter}); not a confirmed incident.`,
      startMs,
      endMs: new Date(iv.end).getTime(),
      active: false,
    };
  });
}

/** Drops the "station off" notice when a current 0 W stretch already says the same thing. */
export function dedupeAlerts(alerts: StationAlert[]): StationAlert[] {
  const zeroNow = alerts.some(a => a.type === 'power_zero' && a.active);
  return zeroNow ? alerts.filter(a => a.type !== 'station_off') : alerts;
}

export function splitAlerts(alerts: StationAlert[], newestMs: number) {
  const sorted = [...dedupeAlerts(alerts)].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.endMs - a.endMs
  );
  const active = sorted.filter(a => a.active);
  const recent = sorted
    .filter(a => !a.active && a.endMs >= newestMs - RECENT_ALERT_WINDOW_MS)
    .sort((a, b) => b.endMs - a.endMs);
  return { active, recent };
}
