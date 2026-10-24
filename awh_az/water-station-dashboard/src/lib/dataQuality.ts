// Presentation helpers for the daily data-quality score (computed by the
// backend, see awh_az/backend/quality.py). Pure, so it can be unit tested.
import type { DailyQuality } from '@/lib/api-client';

export type QualityColor = 'success' | 'warning' | 'error';

export const QUALITY_COLOR: Record<DailyQuality['label'], QualityColor> = {
  good: 'success',
  fair: 'warning',
  poor: 'error',
};

/** Today's date in the stations' timezone (Arizona has no DST). */
export function phoenixToday(nowMs: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix' }).format(new Date(nowMs));
}

/**
 * The day a badge should show: the latest COMPLETE day, because today is still
 * filling up. Falls back to today when it is all there is (a new station).
 */
export function badgeDay(days: DailyQuality[], nowMs: number): DailyQuality | null {
  if (days.length === 0) return null;
  const today = phoenixToday(nowMs);
  const complete = days.filter((d) => d.date < today);
  return complete.length ? complete[complete.length - 1] : days[days.length - 1];
}

/** One line per problem, for tooltips and screen readers. */
export function describeIssues(day: DailyQuality): string[] {
  const lines = day.issues.map((i) => `${i.sensor}: ${i.kind} (${i.detail})`);
  if (day.coverage_pct < 100) {
    lines.unshift(`${day.hours_with_data} of ${day.expected_hours} hours reported`);
  }
  return lines;
}

/** Latest calibration date (YYYY-MM-DD) from a list of events, if any. */
export function lastCalibrationDate(events: { date: string }[] | undefined): string | null {
  if (!events?.length) return null;
  return events.reduce((m, e) => (e.date > m ? e.date : m), events[0].date);
}
