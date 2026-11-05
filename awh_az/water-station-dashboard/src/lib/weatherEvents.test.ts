import { describe, it, expect } from 'vitest';
import { groupWeatherEvents, weatherBands } from '@/lib/weatherEvents';
import type { WeatherRow } from '@/lib/api-client';

const row = (h: number, over: Partial<WeatherRow> = {}): WeatherRow => ({
  hour: `2026-06-01T${String(h).padStart(2, '0')}:00:00Z`,
  temperature_c: 30, humidity_pct: 20, wind_kmh: 5, gust_kmh: 9, precip_mm: 0, weather_code: 0,
  visibility_m: 20000, pm10: 20, dust: 1, rain: false, dust_event: false, condition: 'No rain or dust',
  ...over,
});

describe('groupWeatherEvents', () => {
  it('merges consecutive flagged hours and splits on a gap', () => {
    const rows = [row(1, { rain: true }), row(2, { rain: true }), row(3), row(4, { rain: true }), row(5, { dust_event: true })];
    const ev = groupWeatherEvents(rows);
    expect(ev.filter(e => e.kind === 'rain').map(e => e.hours).sort()).toEqual([1, 2]);
    expect(ev.find(e => e.kind === 'dust_event')?.hours).toBe(1);
    expect(ev[0].start >= ev[ev.length - 1].start).toBe(true); // newest first
  });
  it('returns nothing for a dry, clear stretch', () => {
    expect(groupWeatherEvents([row(1), row(2)])).toEqual([]);
  });
});

describe('weatherBands', () => {
  const row = (hour: string, rain = false, dust = false) =>
    ({ hour, rain, dust_event: dust }) as unknown as WeatherRow;

  it('turns consecutive flagged hours into one band that ends at the end of the last hour', () => {
    const bands = weatherBands([
      row('2026-11-01T10:00:00Z'),
      row('2026-11-01T11:00:00Z', true),
      row('2026-11-01T12:00:00Z', true),
      row('2026-11-01T13:00:00Z'),
    ]);
    expect(bands).toEqual([
      { kind: 'rain', startMs: Date.parse('2026-11-01T11:00:00Z'), endMs: Date.parse('2026-11-01T13:00:00Z') },
    ]);
  });

  it('keeps rain and dust separate and sorts oldest first', () => {
    const bands = weatherBands([
      row('2026-11-01T01:00:00Z', false, true),
      row('2026-11-01T05:00:00Z', true),
    ]);
    expect(bands.map(b => b.kind)).toEqual(['dust_event', 'rain']);
  });

  it('is empty when nothing is flagged', () => {
    expect(weatherBands([row('2026-11-01T01:00:00Z')])).toEqual([]);
  });
});
