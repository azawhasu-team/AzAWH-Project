import { describe, it, expect } from 'vitest';
import { clusterJumps, powerAlerts, reportingAlert, splitAlerts, stationOffAlert, dedupeAlerts } from './alerts';
import type { PowerStatus } from './powerStatus';

const MIN = 60_000;
const T = Date.UTC(2026, 9, 1);
const fmt = (ms: number) => new Date(ms).toISOString();
const status = (over: Partial<PowerStatus>): PowerStatus => ({
  offDates: new Set(), jumpDates: new Set(), stretches: [], jumps: [], currentStretch: null, recentJumps: [], ...over,
});
const jump = (min: number) => ({ ms: T + min * MIN, from: 1000, to: 1600 });

describe('clusterJumps', () => {
  it('merges jumps close together and splits distant ones', () => {
    const c = clusterJumps([jump(0), jump(5), jump(60)], []);
    expect(c.map(x => x.length)).toEqual([2, 1]);
  });

  it('drops jumps beside an off-stretch edge as expected start-up/shutdown', () => {
    const stretch = { startMs: T + 100 * MIN, endMs: T + 200 * MIN, atZero: true };
    const c = clusterJumps([jump(95), jump(205), jump(400)], [stretch]);
    expect(c).toHaveLength(1);
    expect(c[0][0].ms).toBe(T + 400 * MIN);
  });
});

describe('powerAlerts', () => {
  it('turns an ongoing zero stretch into an active warning', () => {
    const s = { startMs: T, endMs: T + 60 * MIN, atZero: true };
    const [a] = powerAlerts(status({ stretches: [s], currentStretch: s }), T + 60 * MIN, fmt);
    expect(a).toMatchObject({ type: 'power_zero', severity: 'warning', active: true });
  });

  it('keeps a finished stretch as a quiet info alert', () => {
    const s = { startMs: T, endMs: T + 60 * MIN, atZero: false };
    const [a] = powerAlerts(status({ stretches: [s] }), T + 600 * MIN, fmt);
    expect(a).toMatchObject({ type: 'power_stuck', severity: 'info', active: false });
  });

  it('merges repeated jumps into one alert, warning when many or recent', () => {
    const jumps = [jump(0), jump(3), jump(6)];
    const out = powerAlerts(status({ jumps }), T + 600 * MIN, fmt);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ type: 'power_unstable', severity: 'warning', active: false });
    const single = powerAlerts(status({ jumps: [jump(0)] }), T + 600 * MIN, fmt);
    expect(single[0].severity).toBe('info');
    const recent = powerAlerts(status({ jumps: [jump(590)] }), T + 600 * MIN, fmt);
    expect(recent[0]).toMatchObject({ severity: 'warning', active: true });
  });
});

describe('reporting and off alerts', () => {
  it('flags not sending as critical and delayed as warning', () => {
    expect(reportingAlert('dead', T, T + 30 * MIN)[0].severity).toBe('critical');
    expect(reportingAlert('stale', T, T + 5 * MIN)[0].severity).toBe('warning');
    expect(reportingAlert('fresh', T, T)).toEqual([]);
  });

  it('drops station-off when a current zero-power alert says the same', () => {
    const s = { startMs: T, endMs: T + MIN, atZero: true };
    const all = [...stationOffAlert(true, T), ...powerAlerts(status({ stretches: [s], currentStretch: s }), T, fmt)];
    expect(dedupeAlerts(all).some(a => a.type === 'station_off')).toBe(false);
  });
});

describe('splitAlerts', () => {
  it('orders active by severity and keeps only last 24h of finished ones as recent', () => {
    const mk = (id: string, severity: 'critical' | 'warning' | 'info', endMs: number, active: boolean) => ({
      id, type: 'power_stuck' as const, severity, title: id, detail: '', startMs: endMs, endMs, active,
    });
    const now = T + 48 * 60 * MIN;
    const { active, recent } = splitAlerts(
      [mk('a', 'warning', now, true), mk('b', 'critical', now, true), mk('old', 'info', T, false), mk('new', 'info', now - 60 * MIN, false)],
      now
    );
    expect(active.map(x => x.id)).toEqual(['b', 'a']);
    expect(recent.map(x => x.id)).toEqual(['new']);
  });
});
