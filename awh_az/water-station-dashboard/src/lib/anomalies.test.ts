import { describe, it, expect } from 'vitest';
import { bandsForChart, intervalsInRange, snapBandToDates, parameterMatchesField, type AnomalyInterval } from './anomalies';

const T = (min: number) => new Date(Date.UTC(2026, 0, 1, 0, min)).toISOString();
const iv = (a: number, b: number, parameter = 'weight'): AnomalyInterval => ({
  start: T(a), end: T(b), parameter, score: 0.99, windows: 3,
});

describe('parameterMatchesField', () => {
  it('links the model parameters to the chart fields derived from them', () => {
    expect(parameterMatchesField('weight', 'accumulated_water_L')).toBe(true);
    expect(parameterMatchesField('humidity', 'abs_humidity_intake')).toBe(true);
    expect(parameterMatchesField('power', 'energy')).toBe(true);
    expect(parameterMatchesField('weight', 'temperature')).toBe(false);
    expect(parameterMatchesField('unknown', 'temperature')).toBe(false);
  });
});

describe('intervalsInRange / bandsForChart', () => {
  const r0 = Date.parse(T(0)), r1 = Date.parse(T(600));
  it('keeps only intervals overlapping the visible range, in time order', () => {
    const out = intervalsInRange([iv(590, 700), iv(700, 800), iv(10, 20), iv(-50, 5)], r0, r1);
    expect(out.map(i => i.start)).toEqual([T(-50), T(10), T(590)]);
  });

  it('shades a chart only for events about its own parameter', () => {
    const list = [iv(10, 20, 'weight'), iv(30, 40, 'temperature')];
    expect(bandsForChart(list, 'accumulated_water_L', r0, r1)).toHaveLength(1);
    expect(bandsForChart(list, 'temperature', r0, r1)).toHaveLength(1);
    expect(bandsForChart(list, 'humidity', r0, r1)).toHaveLength(0);
  });

  it('numbers bands by the event\'s position in the full visible list, so chart and list agree', () => {
    const list = [iv(10, 20, 'weight'), iv(30, 40, 'temperature'), iv(50, 60, 'weight')];
    const water = bandsForChart(list, 'accumulated_water_L', r0, r1);
    expect(water.map(b => b.eventNumber)).toEqual([1, 3]); // event 2 is temperature, not shown here
  });
});

describe('snapBandToDates', () => {
  const dates = [0, 10, 20, 30, 40, 50].map(T);
  const ms = (m: number) => Date.parse(T(m));
  it('snaps to the first and last plotted points inside the band', () => {
    expect(snapBandToDates(dates, ms(12), ms(42))).toEqual({ x1: T(20), x2: T(40) });
  });
  it('collapses a band shorter than the point spacing onto the nearest point', () => {
    expect(snapBandToDates(dates, ms(21), ms(24))).toEqual({ x1: T(20), x2: T(20) });
    expect(snapBandToDates(dates, ms(26), ms(28))).toEqual({ x1: T(30), x2: T(30) });
  });
  it('returns null when the band is entirely outside the data', () => {
    expect(snapBandToDates(dates, ms(-100), ms(-50))).toBeNull();
    expect(snapBandToDates(dates, ms(200), ms(300))).toBeNull();
    expect(snapBandToDates([], ms(0), ms(10))).toBeNull();
  });
  it('clips a band that overhangs the edge of the data', () => {
    expect(snapBandToDates(dates, ms(-30), ms(15))).toEqual({ x1: T(0), x2: T(10) });
  });
});
