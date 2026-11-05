import { describe, it, expect, vi } from 'vitest';
import { ApiStatusError, type HourlyDataRow } from '@/lib/api-client';
import { splitRange, fetchHourlyChunked } from '@/lib/hourlyChunks';

const row = (hour: string) => ({ hour }) as HourlyDataRow;
const noSleep = () => Promise.resolve();

describe('splitRange', () => {
  it('returns one piece for a short range', () => {
    const r = splitRange(new Date('2026-11-01T03:00:00Z'), new Date('2026-11-01T10:00:00Z'));
    expect(r).toHaveLength(1);
    expect(r[0].start.toISOString()).toBe('2026-11-01T03:00:00.000Z');
    expect(r[0].end.toISOString()).toBe('2026-11-01T10:00:00.000Z');
  });

  it('splits a week into ~7 pieces that tile the range without overlap or gaps', () => {
    const start = new Date('2026-10-28T14:55:38Z');
    const end = new Date('2026-11-04T15:55:38Z');
    const r = splitRange(start, end);
    expect(r.length).toBeGreaterThanOrEqual(7);
    expect(r[0].start.getTime()).toBe(start.getTime());
    expect(r[r.length - 1].end.getTime()).toBe(end.getTime());
    for (let i = 1; i < r.length; i++) {
      expect(r[i].start.getTime() - r[i - 1].end.getTime()).toBe(1); // contiguous, no shared ms
    }
  });

  it('cuts only on whole UTC hours so no hourly bucket is split', () => {
    const r = splitRange(new Date('2026-10-28T14:55:38Z'), new Date('2026-11-04T15:55:38Z'));
    for (let i = 1; i < r.length; i++) {
      expect(r[i].start.getUTCMinutes()).toBe(0);
      expect(r[i].start.getUTCSeconds()).toBe(0);
    }
  });

  it('returns nothing for an empty or reversed range', () => {
    const d = new Date('2026-11-01T00:00:00Z');
    expect(splitRange(d, d)).toEqual([]);
    expect(splitRange(new Date('2026-11-02T00:00:00Z'), d)).toEqual([]);
  });
});

describe('fetchHourlyChunked', () => {
  const start = new Date('2026-11-01T00:00:00Z');
  const end = new Date('2026-11-04T00:00:00Z');

  it('merges pieces in hour order and drops duplicate hours', async () => {
    let call = 0;
    const fetchPiece = vi.fn(async () => {
      call++;
      if (call === 1) return { data: [row('2026-11-01T01:00:00Z'), row('2026-11-01T00:00:00Z')] };
      if (call === 2) return { data: [row('2026-11-01T01:00:00Z'), row('2026-11-02T00:00:00Z')] };
      return { data: [row('2026-11-03T00:00:00Z')] };
    });
    const out = await fetchHourlyChunked(fetchPiece, start, end, { sleep: noSleep });
    expect(out.map(r => r.hour)).toEqual([
      '2026-11-01T00:00:00Z',
      '2026-11-01T01:00:00Z',
      '2026-11-02T00:00:00Z',
      '2026-11-03T00:00:00Z',
    ]);
  });

  it('treats a 404 piece as empty and keeps going', async () => {
    let call = 0;
    const fetchPiece = vi.fn(async () => {
      if (++call === 2) throw new ApiStatusError('none', 404);
      return { data: [row(`2026-11-0${call}T00:00:00Z`)] };
    });
    const out = await fetchHourlyChunked(fetchPiece, start, end, { sleep: noSleep });
    expect(out).toHaveLength(2);
  });

  it('retries transient failures (504) and then succeeds', async () => {
    let calls = 0;
    const fetchPiece = vi.fn(async () => {
      if (++calls === 1) throw new ApiStatusError('timeout', 504);
      return { data: [row('2026-11-01T00:00:00Z')] };
    });
    const out = await fetchHourlyChunked(fetchPiece, start, new Date('2026-11-01T12:00:00Z'), { sleep: noSleep });
    expect(calls).toBe(2);
    expect(out).toHaveLength(1);
  });

  it('gives up after the attempt limit and throws rather than returning a CSV with a hole', async () => {
    const fetchPiece = vi.fn(async () => {
      throw new ApiStatusError('busy', 503);
    });
    await expect(
      fetchHourlyChunked(fetchPiece, start, new Date('2026-11-01T12:00:00Z'), { attempts: 3, sleep: noSleep })
    ).rejects.toThrow('busy');
    expect(fetchPiece).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-transient errors', async () => {
    const fetchPiece = vi.fn(async () => {
      throw new ApiStatusError('forbidden', 401);
    });
    await expect(fetchHourlyChunked(fetchPiece, start, end, { sleep: noSleep })).rejects.toThrow('forbidden');
    expect(fetchPiece).toHaveBeenCalledTimes(1);
  });

  it('requests pieces one at a time and reports progress', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchPiece = vi.fn(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight--;
      return { data: [] };
    });
    const progress: Array<[number, number]> = [];
    await fetchHourlyChunked(fetchPiece, start, end, { sleep: noSleep, onProgress: (d, t) => progress.push([d, t]) });
    expect(maxInFlight).toBe(1);
    expect(progress[0]).toEqual([0, 3]);
    expect(progress[progress.length - 1]).toEqual([3, 3]);
  });
});
