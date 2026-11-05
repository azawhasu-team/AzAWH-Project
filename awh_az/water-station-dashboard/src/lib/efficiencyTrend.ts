import type { StationEfficiency } from '@/lib/api-client';

export interface EfficiencyChartRow {
  date: string; // YYYY-MM-DD
  label: string; // "Nov 4"
  [stationName: string]: string | number | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function labelOf(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/**
 * One chart row per day, one column per station (keyed by station_name).
 * Only COMPLETE days are plotted: today is partial and would make the newest
 * point misleading. A day a station has no valid value for is null (a gap).
 */
export function efficiencyChartRows(stations: StationEfficiency[]): EfficiencyChartRow[] {
  const dates = new Set<string>();
  for (const s of stations) for (const d of s.days) if (d.complete) dates.add(d.date);
  return [...dates].sort().map(date => {
    const row: EfficiencyChartRow = { date, label: labelOf(date) };
    for (const s of stations) {
      row[s.station_name] = s.days.find(d => d.date === date && d.complete)?.kwh_per_L ?? null;
    }
    return row;
  });
}

/** Wording and tone for "how does the latest day compare with the days before it". Lower kWh/L is better. */
export function efficiencyChange(changePct: number | null): { text: string; tone: 'good' | 'bad' | 'flat' | 'none' } {
  if (changePct == null) return { text: 'Not enough history to compare', tone: 'none' };
  if (Math.abs(changePct) < 3) return { text: 'About the same as the 7 days before', tone: 'flat' };
  const rounded = Math.round(Math.abs(changePct));
  return changePct < 0
    ? { text: `▼ ${rounded}% less energy per litre than the 7 days before`, tone: 'good' }
    : { text: `▲ ${rounded}% more energy per litre than the 7 days before`, tone: 'bad' };
}
