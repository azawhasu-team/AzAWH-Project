import { describe, it, expect } from 'vitest';
import { freshnessOf, formatAge, isStationOnline } from './freshness';

const NOW = Date.parse('2026-01-01T12:00:00Z');
const ago = (sec: number) => new Date(NOW - sec * 1000).toISOString();

describe('freshnessOf', () => {
  it('classifies by age', () => {
    expect(freshnessOf(ago(30), NOW).label).toBe('Live');
    expect(freshnessOf(ago(300), NOW).label).toBe('Delayed');
    expect(freshnessOf(ago(3600), NOW).label).toBe('Not sending');
  });
  it('treats the 120s and 15-minute boundaries as the next state up', () => {
    expect(freshnessOf(ago(120), NOW).label).toBe('Delayed');
    expect(freshnessOf(ago(899), NOW).label).toBe('Delayed');
    expect(freshnessOf(ago(900), NOW).label).toBe('Not sending');
  });
  it('handles a station that never reported', () => {
    expect(freshnessOf(null, NOW).label).toBe('Waiting for data');
  });
  it('never reports a negative age for a clock-skewed future reading', () => {
    expect(freshnessOf(ago(-60), NOW).ageSec).toBe(0);
  });

  it('considers only actively reporting stations online', () => {
    expect(isStationOnline(ago(119), NOW)).toBe(true);
    expect(isStationOnline(ago(120), NOW)).toBe(true);
    expect(isStationOnline(ago(899), NOW)).toBe(true);
    expect(isStationOnline(ago(900), NOW)).toBe(false);
    expect(isStationOnline(null, NOW)).toBe(false);
  });
});

describe('formatAge', () => {
  it('picks the largest sensible unit', () => {
    expect(formatAge(5)).toBe('5s ago');
    expect(formatAge(150)).toBe('2m ago');
    expect(formatAge(7200)).toBe('2h ago');
    expect(formatAge(3 * 86400)).toBe('3d ago');
  });
});
