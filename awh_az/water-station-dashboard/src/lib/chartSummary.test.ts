import { describe, it, expect } from 'vitest';
import { describeChart } from './chartSummary';

const pt = (date: string, value: number | null, value2?: number) => ({ date, value, value2 });

describe('describeChart', () => {
  it('summarises span, range and latest value', () => {
    const s = describeChart('Temperature', [pt('2026-10-01T00:00:00Z', 20.04), pt('2026-10-03T00:00:00Z', 35.4), pt('2026-10-05T00:00:00Z', 28.8)], { unit1: '°C' });
    expect(s).toBe('Temperature chart, 3 points from 2026-10-01 to 2026-10-05. range 20 to 35.4 °C, latest 28.8 °C.');
  });

  it('ignores null points and says so when nothing is left', () => {
    expect(describeChart('Power', [pt('2026-10-01', null)])).toBe('Power chart. No data in the selected range.');
    expect(describeChart('Power', [pt('2026-10-01', null), pt('2026-10-02', 5)])).toContain('1 point from');
  });

  it('describes a second series when present', () => {
    const s = describeChart('Air', [pt('2026-10-01', 1, 10), pt('2026-10-02', 2, 20)], { name2: 'Outtake', unit2: '%' });
    expect(s).toContain('Outtake: range 10 to 20 %, latest 20 %');
  });
});
