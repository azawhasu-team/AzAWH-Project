import { describe, it, expect } from 'vitest';
import { efficiencyChartRows, efficiencyChange } from '@/lib/efficiencyTrend';
import type { StationEfficiency } from '@/lib/api-client';

const day = (date: string, kwh_per_L: number | null, complete = true) =>
  ({ date, energy_kWh: 10, water_L: 10, kwh_per_L, hours: 24, complete });
const station = (name: string, days: ReturnType<typeof day>[]): StationEfficiency =>
  ({ station_name: name, display_name: name, days, latest: null, latest_date: null, baseline: null, change_pct: null });

describe('efficiencyChartRows', () => {
  it('has one row per complete day with a column per station, and gaps as null', () => {
    const rows = efficiencyChartRows([
      station('a', [day('2026-11-02', 1.0), day('2026-11-03', 0.9)]),
      station('b', [day('2026-11-03', 2.0)]),
    ]);
    expect(rows.map(r => r.date)).toEqual(['2026-11-02', '2026-11-03']);
    expect(rows[0]).toMatchObject({ label: 'Nov 2', a: 1.0, b: null });
    expect(rows[1]).toMatchObject({ a: 0.9, b: 2.0 });
  });

  it('leaves out today (incomplete) so the newest point is never a partial day', () => {
    const rows = efficiencyChartRows([station('a', [day('2026-11-04', 1.0), day('2026-11-05', 0.3, false)])]);
    expect(rows.map(r => r.date)).toEqual(['2026-11-04']);
  });

  it('keeps a day with no valid ratio as a gap, not zero', () => {
    const rows = efficiencyChartRows([station('a', [day('2026-11-04', null), day('2026-11-05', 1.2)])]);
    expect(rows[0].a).toBeNull();
  });
});

describe('efficiencyChange', () => {
  it('lower energy per litre is good, higher is bad, tiny moves are flat', () => {
    expect(efficiencyChange(-23.6)).toEqual({ text: '▼ 24% less energy per litre than the 7 days before', tone: 'good' });
    expect(efficiencyChange(12)).toEqual({ text: '▲ 12% more energy per litre than the 7 days before', tone: 'bad' });
    expect(efficiencyChange(1.4).tone).toBe('flat');
    expect(efficiencyChange(-2.9).tone).toBe('flat');
  });
  it('says so when there is nothing to compare with', () => {
    expect(efficiencyChange(null).tone).toBe('none');
  });
});
