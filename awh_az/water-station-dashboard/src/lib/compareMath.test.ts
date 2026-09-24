import { describe, it, expect } from 'vitest';
import {
  convertLiters,
  convertSpecificEnergy,
  summarizeWindow,
  excludeDowntime,
  buildComparisonPoint,
  monthKeyOf,
  monthRangeISO,
  formatMeasurementValue,
} from './compareMath';
import type { HourlyDataRow } from './api-client';

const row = (extra: Partial<HourlyDataRow> = {}): HourlyDataRow =>
  ({ hour: '2026-01-01T00:00:00Z', reading_count: 1, ...extra }) as HourlyDataRow;

describe('unit conversion', () => {
  it('converts volume and specific energy as reciprocals', () => {
    // 1 L is 1/x of a unit, and 1 kWh/L is x kWh per unit — so the two multiply to 1
    for (const unit of ['gal', 'acre-ft'] as const) {
      expect(convertLiters(1, unit) * convertSpecificEnergy(1, unit)).toBeCloseTo(1, 10);
    }
  });

  it('leaves litres untouched', () => {
    expect(convertLiters(12, 'L')).toBe(12);
    expect(convertSpecificEnergy(0.4, 'L')).toBe(0.4);
  });
});

describe('summarizeWindow', () => {
  it('sums water and takes each metric\'s own most recent non-null hour', () => {
    const rows = [
      row({ water_produced_L: 1, harvesting_efficiency_pct_hourly: 10, energy_per_liter_kWh_L: 0.3 }),
      row({ water_produced_L: 2, harvesting_efficiency_pct_hourly: 20, energy_per_liter_kWh_L: null }),
      row({ water_produced_L: null, harvesting_efficiency_pct_hourly: null, energy_per_liter_kWh_L: null }),
    ];
    expect(summarizeWindow(rows)).toEqual({
      waterProducedL: 3,
      lastEfficiencyPct: 20, // sensor out in the last hour doesn't blank it
      lastSpecificEnergyKWhPerL: 0.3,
    });
  });

  it('reports null water, not zero, when no hour has a value', () => {
    expect(summarizeWindow([row()]).waterProducedL).toBeNull();
    expect(summarizeWindow([]).waterProducedL).toBeNull();
  });
});

describe('excludeDowntime', () => {
  const w = (v: number | null) => row({ water_produced_L: v });
  it('drops runs of 2+ zero hours but keeps single zero hours', () => {
    const out = excludeDowntime([w(1), w(0), w(0), w(2), w(0), w(3)]);
    expect(out.map(r => r.water_produced_L)).toEqual([1, 2, 0, 3]);
  });
});

describe('buildComparisonPoint', () => {
  it('total is a sum and has no spread', () => {
    const p = buildComparisonPoint('k', 'K', [row({ water_produced_L: 1 }), row({ water_produced_L: 2 })], 'total', 'L');
    expect(p).toMatchObject({ mean: 3, std: null, latest: null, hasData: true });
  });

  it('production is a mean that ignores downtime runs', () => {
    const z = row({ water_produced_L: 0 });
    const p = buildComparisonPoint('k', 'K', [row({ water_produced_L: 4 }), z, z, row({ water_produced_L: 2 })], 'production', 'L');
    expect(p.mean).toBe(3);
    expect(p.latest).toBe(2);
  });

  it('reports no data when the field is entirely null', () => {
    expect(buildComparisonPoint('k', 'K', [row()], 'efficiency', 'L').hasData).toBe(false);
  });

  it('does not unit-convert efficiency', () => {
    const p = buildComparisonPoint('k', 'K', [row({ harvesting_efficiency_pct_hourly: 7 })], 'efficiency', 'gal');
    expect(p.mean).toBe(7);
  });
});

describe('month helpers', () => {
  it('round-trips a date to its yyyy-MM key', () => {
    expect(monthKeyOf(new Date(2026, 0, 15))).toBe('2026-01');
  });

  it('gives inclusive UTC month bounds, including leap-year February', () => {
    expect(monthRangeISO('2028-02')).toEqual({
      start: '2028-02-01T00:00:00.000Z',
      end: '2028-02-29T23:59:59.999Z',
    });
  });
});

describe('formatMeasurementValue', () => {
  it('scales precision to the unit', () => {
    expect(formatMeasurementValue(1234.5678, 'energy', 'acre-ft')).toContain('1,235');
    expect(formatMeasurementValue(12.3, 'efficiency', 'L')).toBe('12.3%');
  });
});
