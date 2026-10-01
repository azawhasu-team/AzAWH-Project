import { describe, it, expect } from 'vitest';
import { formatPhoenixCsvDateTime } from './timezone';

describe('formatPhoenixCsvDateTime', () => {
  it('converts UTC to Arizona time (UTC-7, no DST)', () => {
    expect(formatPhoenixCsvDateTime('2026-09-11T00:00:30.712Z')).toBe('2026-09-10 17:00:30');
    expect(formatPhoenixCsvDateTime('2026-01-15T07:05:00+00:00')).toBe('2026-01-15 00:05:00');
  });
  it('handles offsets and midnight as 00, not 24', () => {
    expect(formatPhoenixCsvDateTime('2026-09-10T17:00:00-07:00')).toBe('2026-09-10 17:00:00');
    expect(formatPhoenixCsvDateTime('2026-07-01T07:00:00Z')).toBe('2026-07-01 00:00:00');
  });
  it('returns empty string for missing or invalid input', () => {
    expect(formatPhoenixCsvDateTime(null)).toBe('');
    expect(formatPhoenixCsvDateTime('nope')).toBe('');
  });
});
