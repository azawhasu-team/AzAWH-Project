import { describe, it, expect } from 'vitest';
import { stationAttention } from './fleetAttention';

const NOW = Date.UTC(2026, 9, 17, 12, 0, 0);
const MIN = 60_000;
const wobbly = (minutes: number) =>
  Array.from({ length: minutes }, (_, i) => ({
    timestamp: new Date(NOW - (minutes - i) * MIN).toISOString(),
    power: 900 + (i % 7) * 12,
  }));

describe('stationAttention', () => {
  it('never flags a station that is not expected to run', () => {
    expect(stationAttention({ expectedRunning: false, lastReadingMs: NOW - 99 * 24 * 60 * MIN, nowMs: NOW }).level).toBe('ok');
  });

  it('is critical when an active station stopped sending', () => {
    const a = stationAttention({ expectedRunning: true, lastReadingMs: NOW - 30 * MIN, nowMs: NOW });
    expect(a).toEqual({ level: 'critical', reason: 'Station not sending data' });
  });

  it('is a warning when readings are delayed', () => {
    expect(stationAttention({ expectedRunning: true, lastReadingMs: NOW - 5 * MIN, nowMs: NOW }).level).toBe('warning');
  });

  it('is critical with no readings at all', () => {
    expect(stationAttention({ expectedRunning: true, lastReadingMs: null, nowMs: NOW }).level).toBe('critical');
  });

  it('is ok for a live station with healthy power', () => {
    const a = stationAttention({ expectedRunning: true, lastReadingMs: NOW - 20_000, nowMs: NOW, readings: wobbly(90) });
    expect(a.level).toBe('ok');
  });

  it('warns when power has been stuck at one value', () => {
    const stuck = Array.from({ length: 90 }, (_, i) => ({ timestamp: new Date(NOW - (90 - i) * MIN).toISOString(), power: 900 }));
    const a = stationAttention({ expectedRunning: true, lastReadingMs: NOW - 20_000, nowMs: NOW, readings: stuck });
    expect(a.level).toBe('warning');
    expect(a.reason).toMatch(/not changing/);
  });
});
