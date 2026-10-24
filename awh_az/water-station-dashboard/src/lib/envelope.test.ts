import { describe, it, expect } from 'vitest';
import type { HourlyDataRow } from '@/lib/api-client';
import { buildEnvelope, summarizeEnvelope, isUsableHour, goodness } from './envelope';

const row = (over: Partial<HourlyDataRow>): HourlyDataRow =>
  ({
    hour: '2026-10-01T00:00:00Z',
    reading_count: 60,
    temperature_mean: 31,
    humidity_mean: 45,
    water_produced_L: 1,
    energy_consumed_kWh: 1,
    harvesting_efficiency_pct_hourly: 10,
    ...over,
  }) as HourlyDataRow;

const many = (n: number, over: Partial<HourlyDataRow>) => Array.from({ length: n }, () => row(over));

describe('isUsableHour', () => {
  it('rejects off hours (energy null), missing air data and negative water', () => {
    expect(isUsableHour(row({}))).toBe(true);
    expect(isUsableHour(row({ energy_consumed_kWh: null }))).toBe(false);
    expect(isUsableHour(row({ humidity_mean: null }))).toBe(false);
    expect(isUsableHour(row({ water_produced_L: -1 }))).toBe(false);
  });
});

describe('buildEnvelope', () => {
  it('bins by 3 C x 10 % RH and counts skipped hours', () => {
    const env = buildEnvelope([...many(3, {}), row({ energy_consumed_kWh: null })]);
    expect(env.usedHours).toBe(3);
    expect(env.skippedHours).toBe(1);
    expect(env.cells).toHaveLength(1);
    expect(env.cells[0]).toMatchObject({ tempBin: 30, rhBin: 40, hours: 3 });
  });

  it('computes energy per litre as a ratio of sums, not a mean of ratios', () => {
    const env = buildEnvelope([
      row({ water_produced_L: 1, energy_consumed_kWh: 1 }),
      row({ water_produced_L: 3, energy_consumed_kWh: 1 }),
    ]);
    expect(env.cells[0].kWhPerL).toBeCloseTo(0.5); // 2 kWh / 4 L, not (1 + 0.33) / 2
  });

  it('keeps 100 % humidity inside the top bin', () => {
    const env = buildEnvelope([row({ humidity_mean: 100 })]);
    expect(env.cells[0].rhBin).toBe(90);
  });

  it('returns an empty envelope for no usable data', () => {
    const env = buildEnvelope([row({ energy_consumed_kWh: null })]);
    expect(env.cells).toEqual([]);
    expect(env.tempBins).toEqual([]);
  });
});

describe('summarizeEnvelope', () => {
  const rows = [
    ...many(6, { temperature_mean: 22, humidity_mean: 25, water_produced_L: 0.5, energy_consumed_kWh: 1 }),
    ...many(6, { temperature_mean: 34, humidity_mean: 55, water_produced_L: 2, energy_consumed_kWh: 1 }),
    ...many(2, { temperature_mean: 40, humidity_mean: 85, water_produced_L: 9, energy_consumed_kWh: 1 }), // too thin
  ];
  const env = buildEnvelope(rows);

  it('ranks only cells with enough hours', () => {
    const s = summarizeEnvelope(env, 'water');
    expect(s.rankedCells).toBe(2);
    expect(s.best).toMatchObject({ tempBin: 33, rhBin: 50 });
    expect(s.worst).toMatchObject({ tempBin: 21, rhBin: 20 });
    expect(s.spreadFactor).toBeCloseTo(4);
  });

  it('treats lower energy per litre as better', () => {
    const s = summarizeEnvelope(env, 'energy');
    expect(s.best).toMatchObject({ tempBin: 33, rhBin: 50 }); // 0.5 kWh/L beats 2 kWh/L
    expect(goodness(0.5, env, 'energy')).toBe(1);
    expect(goodness(2, env, 'energy')).toBe(0);
  });

  it('reports nothing when no cell is ranked', () => {
    const s = summarizeEnvelope(buildEnvelope(many(2, {})), 'water');
    expect(s.best).toBeNull();
    expect(s.spreadFactor).toBeNull();
  });
});
