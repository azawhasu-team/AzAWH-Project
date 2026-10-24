import { describe, it, expect } from 'vitest';
import { mayHaveDataSince } from './stationData';

const st = (last: string | null | undefined) => ({ metadata: { last_reading: last } }) as never;

describe('mayHaveDataSince', () => {
  it('skips stations that stopped before the window or never reported', () => {
    expect(mayHaveDataSince(st('2025-10-21T00:00:00Z'), '2026-04-01T00:00:00Z')).toBe(false);
    expect(mayHaveDataSince(st(null), '2026-04-01T00:00:00Z')).toBe(false);
    expect(mayHaveDataSince(st(undefined))).toBe(false);
  });
  it('keeps stations that reported inside the window', () => {
    expect(mayHaveDataSince(st('2026-10-01T00:00:00Z'), '2026-04-01T00:00:00Z')).toBe(true);
  });
  it('keeps everything for an all-time window and on unparseable dates', () => {
    expect(mayHaveDataSince(st('2020-01-01T00:00:00Z'))).toBe(true);
    expect(mayHaveDataSince(st('not a date'), '2026-04-01T00:00:00Z')).toBe(true);
  });
});
