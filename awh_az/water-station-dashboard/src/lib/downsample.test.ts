import { describe, it, expect } from 'vitest';
import { downsampleMinMax } from './downsample';

const series = (n: number, f: (i: number) => number | null) =>
  Array.from({ length: n }, (_, i) => ({ date: String(i), value: f(i) }));

describe('downsampleMinMax', () => {
  it('returns the input untouched when it already fits', () => {
    const d = series(100, i => i);
    expect(downsampleMinMax(d, 500)).toBe(d);
  });

  it('never exceeds the point budget and keeps first and last', () => {
    const d = series(20000, i => Math.sin(i / 50));
    const out = downsampleMinMax(d, 500);
    expect(out.length).toBeLessThanOrEqual(500);
    expect(out[0]).toBe(d[0]);
    expect(out[out.length - 1]).toBe(d[d.length - 1]);
  });

  it('keeps a single-sample spike that stride sampling would drop', () => {
    const d = series(20000, i => (i === 12345 ? 999 : 1));
    const out = downsampleMinMax(d, 500);
    expect(out.some(p => p.value === 999)).toBe(true);
    // ...and would indeed have been lost by keeping every Nth point:
    const step = Math.ceil(d.length / 500);
    expect(d.filter((_, i) => i % step === 0).some(p => p.value === 999)).toBe(false);
  });

  it('keeps the deepest dip too', () => {
    const d = series(20000, i => (i === 777 ? -50 : 10));
    expect(downsampleMinMax(d, 500).some(p => p.value === -50)).toBe(true);
  });

  it('preserves a null gap instead of bridging it', () => {
    const d = series(20000, i => (i >= 9000 && i < 9500 ? null : 5));
    expect(downsampleMinMax(d, 500).some(p => p.value === null)).toBe(true);
  });

  it('does not fragment the line for isolated dropped samples', () => {
    // one missing reading every 25 — the shape of an occasionally-dropping sensor
    const d = series(20000, i => (i % 25 === 7 ? null : 5));
    expect(downsampleMinMax(d, 500).some(p => p.value === null)).toBe(false);
  });

  it('keeps the second series\' extremes as well', () => {
    const d = series(20000, () => 1).map((p, i) => ({ ...p, value2: i === 4242 ? 500 : 1 }));
    expect(downsampleMinMax(d, 500).some(p => p.value2 === 500)).toBe(true);
  });

  it('returns points in time order with no duplicates', () => {
    const d = series(20000, i => Math.sin(i / 7));
    const idx = downsampleMinMax(d, 500).map(p => Number(p.date));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect(new Set(idx).size).toBe(idx.length);
  });
});
