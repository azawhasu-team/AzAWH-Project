import { describe, it, expect } from 'vitest';
import { detectPowerStatus } from './powerStatus';

const T0 = Date.UTC(2026, 9, 1, 0, 0);
const series = (vals: (number | null)[]) =>
  vals.map((value, i) => ({ date: new Date(T0 + i * 60_000).toISOString(), value }));
// a normally-wobbling running signal around 1200 W
const running = (n: number, start = 0) => Array.from({ length: n }, (_, i) => 1200 + ((i + start) % 5) * 3 - 6);

describe('detectPowerStatus', () => {
  it('flags a long unchanged stretch as off and reports it as ongoing', () => {
    const r = detectPowerStatus(series([...running(20), ...Array(15).fill(1180.2)]));
    expect(r.stretches).toHaveLength(1);
    expect(r.stretches[0].atZero).toBe(false);
    expect(r.currentStretch).not.toBeNull();
  });

  it('does not flag a short plateau', () => {
    const r = detectPowerStatus(series([...running(20), ...Array(5).fill(1180.2), ...running(20, 3)]));
    expect(r.stretches).toHaveLength(0);
    expect(r.currentStretch).toBeNull();
  });

  it('flags zero readings of any length and marks the stretch atZero', () => {
    const r = detectPowerStatus(series([...running(20), 0, 0, ...running(20, 1)]));
    expect(r.stretches).toHaveLength(1);
    expect(r.stretches[0].atZero).toBe(true);
    expect(r.currentStretch).toBeNull(); // running again
  });

  it('flags a sudden jump (start-up) but not ordinary wobble', () => {
    const calm = detectPowerStatus(series(running(60)));
    expect(calm.jumps).toHaveLength(0);
    const r = detectPowerStatus(series([...running(30), 2400, ...running(10)]));
    expect(r.jumps).toHaveLength(2); // up, then back down
    expect(Math.abs(r.jumps[0].from - 1200)).toBeLessThan(10);
    expect(r.jumps[0].to).toBe(2400);
  });

  it('ignores steps below the absolute floor on a quiet signal', () => {
    const r = detectPowerStatus(series([...Array(30).fill(0.2).map((v, i) => v + (i % 2) * 0.1), 10]));
    expect(r.jumps).toHaveLength(0);
  });

  it('breaks stretches at missing readings', () => {
    const r = detectPowerStatus(series([...running(10), 0, 0, null, 0, 0, ...running(10, 2)]));
    expect(r.stretches).toHaveLength(2);
  });
});
