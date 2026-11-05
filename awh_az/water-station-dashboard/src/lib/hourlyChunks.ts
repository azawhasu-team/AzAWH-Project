import { ApiStatusError, type HourlyDataRow } from '@/lib/api-client';

// The hourly endpoint reads every raw reading in the range from the database.
// With a 5 s upload cadence a week is ~50k readings, which is more than the
// backend can finish inside the proxy's time limit (504/503/429). So the range
// is requested in short pieces and the hourly rows are stitched back together.

const HOUR_MS = 60 * 60 * 1000;
export const DEFAULT_CHUNK_HOURS = 24;

export interface TimeRange {
  start: Date;
  end: Date;
}

/**
 * Split [start, end] into consecutive pieces of about `chunkHours`. Interior
 * boundaries are snapped down to a whole UTC hour so no hourly bucket is split
 * across two requests, and each piece ends 1 ms before the next begins because
 * the backend treats end_date as inclusive.
 */
export function splitRange(start: Date, end: Date, chunkHours = DEFAULT_CHUNK_HOURS): TimeRange[] {
  const s = start.getTime();
  const e = end.getTime();
  if (!(e > s)) return [];
  const step = Math.max(1, chunkHours) * HOUR_MS;

  const cuts: number[] = [];
  for (let t = s + step; t < e; t += step) {
    const snapped = Math.floor(t / HOUR_MS) * HOUR_MS;
    if (snapped > s && snapped < e && (cuts.length === 0 || snapped > cuts[cuts.length - 1])) cuts.push(snapped);
  }

  const ranges: TimeRange[] = [];
  let from = s;
  for (const cut of cuts) {
    ranges.push({ start: new Date(from), end: new Date(cut - 1) });
    from = cut;
  }
  ranges.push({ start: new Date(from), end: new Date(e) });
  return ranges;
}

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

function isRetryable(err: unknown): boolean {
  if (err instanceof ApiStatusError) return RETRYABLE_STATUS.has(err.status);
  // Network failures / client-side "Request timed out" carry no status.
  return err instanceof Error;
}

export interface ChunkedOptions {
  chunkHours?: number;
  /** Attempts per piece, including the first. */
  attempts?: number;
  backoffMs?: number;
  onProgress?: (done: number, total: number) => void;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Fetch hourly rows for a range piece by piece, one request at a time (parallel
 * requests would just re-create the overload). A piece with no readings (404)
 * is skipped; transient failures are retried with a growing delay; anything
 * else, or running out of attempts, throws so the caller can show the error
 * instead of silently producing a CSV with a hole in it.
 */
export async function fetchHourlyChunked(
  fetchPiece: (range: { start_date: string; end_date: string }) => Promise<{ data: HourlyDataRow[] }>,
  start: Date,
  end: Date,
  options: ChunkedOptions = {}
): Promise<HourlyDataRow[]> {
  const attempts = options.attempts ?? 3;
  const backoffMs = options.backoffMs ?? 3000;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  const pieces = splitRange(start, end, options.chunkHours);
  const byHour = new Map<string, HourlyDataRow>();

  options.onProgress?.(0, pieces.length);
  for (let i = 0; i < pieces.length; i++) {
    const range = { start_date: pieces[i].start.toISOString(), end_date: pieces[i].end.toISOString() };
    for (let attempt = 1; ; attempt++) {
      try {
        const resp = await fetchPiece(range);
        for (const row of resp.data) if (!byHour.has(row.hour)) byHour.set(row.hour, row);
        break;
      } catch (err) {
        if (err instanceof ApiStatusError && err.status === 404) break; // no readings in this piece
        if (attempt >= attempts || !isRetryable(err)) throw err;
        await sleep(backoffMs * attempt);
      }
    }
    options.onProgress?.(i + 1, pieces.length);
  }

  return [...byHour.values()].sort((a, b) => a.hour.localeCompare(b.hour));
}
