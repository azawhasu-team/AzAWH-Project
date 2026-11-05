import type { WeatherRow } from '@/lib/api-client';

export interface WeatherEvent {
  kind: 'rain' | 'dust_event';
  start: string; // first hour (ISO)
  end: string; // last hour (ISO)
  hours: number;
}

/** Group consecutive flagged hours into events (newest first). */
export function groupWeatherEvents(rows: WeatherRow[]): WeatherEvent[] {
  const sorted = [...rows].sort((a, b) => a.hour.localeCompare(b.hour));
  const events: WeatherEvent[] = [];
  for (const kind of ['rain', 'dust_event'] as const) {
    let open: WeatherEvent | null = null;
    let prevMs = 0;
    for (const r of sorted) {
      const ms = new Date(r.hour).getTime();
      if (r[kind]) {
        if (open && ms - prevMs <= 3_600_000) {
          open.end = r.hour;
          open.hours += 1;
        } else {
          open = { kind, start: r.hour, end: r.hour, hours: 1 };
          events.push(open);
        }
        prevMs = ms;
      } else {
        open = null;
      }
    }
  }
  return events.sort((a, b) => b.start.localeCompare(a.start));
}

export interface WeatherBand {
  kind: 'rain' | 'dust_event';
  startMs: number;
  /** Exclusive end: the end of the last flagged hour. */
  endMs: number;
}

/** Rain / dust events as [start, end) time bands, oldest first, for shading charts. */
export function weatherBands(rows: WeatherRow[]): WeatherBand[] {
  return groupWeatherEvents(rows)
    .map(e => ({
      kind: e.kind,
      startMs: new Date(e.start).getTime(),
      endMs: new Date(e.end).getTime() + 3_600_000,
    }))
    .sort((a, b) => a.startMs - b.startMs);
}
