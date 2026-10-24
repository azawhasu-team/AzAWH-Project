import { describe, it, expect } from 'vitest';
import type { DailyQuality } from '@/lib/api-client';
import { badgeDay, describeIssues, lastCalibrationDate, phoenixToday } from './dataQuality';

const day = (date: string, over: Partial<DailyQuality> = {}): DailyQuality => ({
  date, score: 90, label: 'good', coverage_pct: 100, hours_with_data: 24, expected_hours: 24, issues: [], ...over,
});

// 2026-10-22 07:30 UTC = 00:30 Oct 22 in Phoenix
const NOW = Date.parse('2026-10-22T07:30:00Z');

describe('phoenixToday', () => {
  it('uses Arizona time, not UTC', () => {
    expect(phoenixToday(NOW)).toBe('2026-10-22');
    expect(phoenixToday(Date.parse('2026-10-22T05:00:00Z'))).toBe('2026-10-21'); // still the 21st in Phoenix
  });
});

describe('badgeDay', () => {
  it('prefers the latest complete day over the partial today', () => {
    const d = badgeDay([day('2026-10-20'), day('2026-10-21', { score: 55 }), day('2026-10-22', { score: 99 })], NOW);
    expect(d?.date).toBe('2026-10-21');
  });
  it('falls back to today for a brand-new station, and null for no data', () => {
    expect(badgeDay([day('2026-10-22')], NOW)?.date).toBe('2026-10-22');
    expect(badgeDay([], NOW)).toBeNull();
  });
});

describe('describeIssues', () => {
  it('lists coverage and each sensor problem', () => {
    const lines = describeIssues(day('x', {
      coverage_pct: 50, hours_with_data: 12,
      issues: [{ sensor: 'intake humidity', kind: 'frozen', detail: 'constant 40 for 12 hours' }],
    }));
    expect(lines).toEqual(['12 of 24 hours reported', 'intake humidity: frozen (constant 40 for 12 hours)']);
  });
});

describe('lastCalibrationDate', () => {
  it('returns the newest date or null', () => {
    expect(lastCalibrationDate([{ date: '2026-01-02' }, { date: '2026-09-01' }])).toBe('2026-09-01');
    expect(lastCalibrationDate([])).toBeNull();
    expect(lastCalibrationDate(undefined)).toBeNull();
  });
});
