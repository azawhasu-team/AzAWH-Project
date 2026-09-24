import { describe, it, expect } from 'vitest';
import { buildParameterCategories, buildChartSeries } from './stationChartData';
import { WEIGHT_NOISE_FLOOR_G, ENERGY_SANITY_CEILING_KWH } from './stationFields';
import type { StationReading } from './api-client';

const T0 = new Date('2026-01-01T00:00:00Z');
const at = (sec: number) => new Date(T0.getTime() + sec * 1000).toISOString();
const reading = (sec: number, extra: Partial<StationReading> = {}) =>
  ({ timestamp: at(sec), ...extra }) as StationReading;
const window = [new Date(T0.getTime() - 1000), new Date(T0.getTime() + 3_600_000)] as const;

describe('buildParameterCategories', () => {
  it('replaces raw weight with accumulated water', () => {
    const cats = buildParameterCategories(['weight']);
    expect(cats['Water Production']).toContain('accumulated_water_L');
    expect(Object.values(cats).flat()).not.toContain('weight');
  });

  it('adds derived humidity only when both inputs exist', () => {
    expect(buildParameterCategories(['temperature'])['Air Conditions'] ?? []).not.toContain('abs_humidity_intake');
    expect(buildParameterCategories(['temperature', 'humidity'])['Air Conditions']).toContain('abs_humidity_intake');
  });

  it('offers efficiency only with temperature, humidity, velocity and weight', () => {
    expect(buildParameterCategories(['temperature', 'humidity', 'velocity'])['Efficiency']).toBeUndefined();
    expect(
      buildParameterCategories(['temperature', 'humidity', 'velocity', 'weight'])['Efficiency']
    ).toContain('harvesting_efficiency');
  });

  it('does not duplicate derived fields', () => {
    const cats = buildParameterCategories(['temperature', 'humidity', 'weight']);
    const all = Object.values(cats).flat();
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('buildChartSeries', () => {
  it('returns nothing without a range, parameters or readings', () => {
    const r = [reading(0, { temperature: 20 })];
    expect(buildChartSeries(r, null, window[1], ['temperature'])).toEqual([]);
    expect(buildChartSeries(r, ...window, [])).toEqual([]);
    expect(buildChartSeries([], ...window, ['temperature'])).toEqual([]);
  });

  it('sorts descending API data ascending and filters to the range', () => {
    const rs = [reading(60, { temperature: 3 }), reading(30, { temperature: 2 }), reading(0, { temperature: 1 }), reading(99999, { temperature: 9 })];
    const [series] = buildChartSeries(rs, ...window, ['temperature']);
    expect(series.data.map(d => d.value)).toEqual([1, 2, 3]);
  });

  it('accumulates water and ignores weight changes below the noise floor', () => {
    const big = WEIGHT_NOISE_FLOOR_G * 10;
    const rs = [
      reading(0, { weight: 100 }),
      reading(30, { weight: 100 + WEIGHT_NOISE_FLOOR_G / 2 }), // noise
      reading(60, { weight: 100 + big }),
    ];
    const [series] = buildChartSeries(rs, ...window, ['accumulated_water_L']);
    const values = series.data.map(d => d.value as number);
    expect(values[0]).toBe(0);
    expect(values[1]).toBe(0);
    expect(values[2]).toBeCloseTo((big - WEIGHT_NOISE_FLOOR_G / 2) / 1000, 5);
  });

  it('plots corrupt energy readings as gaps and does not use them as a baseline', () => {
    const rs = [
      reading(0, { energy: 1.0 }),
      reading(30, { energy: ENERGY_SANITY_CEILING_KWH + 1 }),
      reading(60, { energy: 1.5 }),
    ];
    const [cum, inc] = buildChartSeries(rs, ...window, ['energy', 'incremental_energy_kWh']);
    expect(cum.data.map(d => d.value)).toEqual([1.0, null, 1.5]);
    expect(inc.data.map(d => d.value)).toEqual([0, null, 0.5]);
  });

  it('plots a missing reading as a gap, never as zero', () => {
    const rs = [
      reading(0, { energy: 1, temperature: 20, humidity: 50 }),
      reading(30, {}), // dropout: no sensor values at all
      reading(60, { energy: 2, temperature: 21, humidity: 51 }),
    ];
    const out = buildChartSeries(rs, ...window, ['energy', 'temperature', 'abs_humidity_intake']);
    for (const series of out) {
      expect(series.data[1].value).toBeNull();
      expect(series.data[0].value).not.toBeNull();
    }
  });

  it('gives one independent series per selected parameter', () => {
    const rs = [reading(0, { temperature: 20, humidity: 50 })];
    const out = buildChartSeries(rs, ...window, ['temperature', 'humidity']);
    expect(out.map(s => s.field)).toEqual(['temperature', 'humidity']);
  });
});
