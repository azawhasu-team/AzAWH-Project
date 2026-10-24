// Operating-envelope math — pure, no React, no I/O.
//
// Bins hourly station rows by intake temperature x relative humidity and
// summarises water yield, specific energy and harvesting efficiency per cell,
// so the lab can see under which air conditions a station actually performs.
import type { HourlyDataRow } from '@/lib/api-client';

export type EnvelopeMetric = 'water' | 'energy' | 'efficiency';

export const TEMP_STEP_C = 3;
export const RH_STEP_PCT = 10;
/** Cells with fewer on-hours than this are drawn faded and never crowned best. */
export const MIN_HOURS_SHOWN = 2;
export const MIN_HOURS_RANKED = 5;

export interface EnvelopeCell {
  tempBin: number; // lower edge, °C
  rhBin: number; // lower edge, %
  hours: number;
  waterL: number; // total
  energyKWh: number; // total, over hours that have both energy and water
  waterPerHourL: number;
  kWhPerL: number | null; // ratio of sums, not mean of ratios
  efficiencyPct: number | null; // mean of hourly values
}

export interface Envelope {
  cells: EnvelopeCell[];
  tempBins: number[];
  rhBins: number[];
  usedHours: number;
  skippedHours: number;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** An hour counts only if the station was on and we know the air it breathed. */
export function isUsableHour(r: HourlyDataRow): boolean {
  return (
    isNum(r.temperature_mean) &&
    isNum(r.humidity_mean) &&
    isNum(r.water_produced_L) &&
    r.water_produced_L >= 0 &&
    isNum(r.energy_consumed_kWh) // null when the backend judged the hour "off"
  );
}

export function buildEnvelope(rows: HourlyDataRow[]): Envelope {
  const acc = new Map<
    string,
    { t: number; rh: number; hours: number; water: number; energy: number; effSum: number; effN: number }
  >();
  let used = 0;
  for (const r of rows) {
    if (!isUsableHour(r)) continue;
    used += 1;
    const t = Math.floor(r.temperature_mean! / TEMP_STEP_C) * TEMP_STEP_C;
    const rh = Math.min(Math.floor(r.humidity_mean! / RH_STEP_PCT) * RH_STEP_PCT, 100 - RH_STEP_PCT);
    const key = `${t}|${rh}`;
    const c = acc.get(key) ?? { t, rh, hours: 0, water: 0, energy: 0, effSum: 0, effN: 0 };
    c.hours += 1;
    c.water += r.water_produced_L!;
    c.energy += r.energy_consumed_kWh!;
    if (isNum(r.harvesting_efficiency_pct_hourly)) {
      c.effSum += r.harvesting_efficiency_pct_hourly;
      c.effN += 1;
    }
    acc.set(key, c);
  }
  const cells: EnvelopeCell[] = [...acc.values()].map((c) => ({
    tempBin: c.t,
    rhBin: c.rh,
    hours: c.hours,
    waterL: c.water,
    energyKWh: c.energy,
    waterPerHourL: c.water / c.hours,
    kWhPerL: c.water > 0 ? c.energy / c.water : null,
    efficiencyPct: c.effN > 0 ? c.effSum / c.effN : null,
  }));
  const tempBins = cells.length ? range(Math.min(...cells.map((c) => c.tempBin)), Math.max(...cells.map((c) => c.tempBin)), TEMP_STEP_C) : [];
  const rhBins = cells.length ? range(Math.min(...cells.map((c) => c.rhBin)), Math.max(...cells.map((c) => c.rhBin)), RH_STEP_PCT) : [];
  return { cells, tempBins, rhBins, usedHours: used, skippedHours: rows.length - used };
}

function range(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  for (let v = lo; v <= hi; v += step) out.push(v);
  return out;
}

export function metricValue(c: EnvelopeCell, m: EnvelopeMetric): number | null {
  if (m === 'water') return c.waterPerHourL;
  if (m === 'energy') return c.kWhPerL;
  return c.efficiencyPct;
}

/** For energy per litre, lower is better; for the others, higher is. */
export function lowerIsBetter(m: EnvelopeMetric): boolean {
  return m === 'energy';
}

export interface EnvelopeSummary {
  best: EnvelopeCell | null;
  worst: EnvelopeCell | null;
  /** best / worst, oriented so that it is always >= 1 ("x times better"). */
  spreadFactor: number | null;
  rankedCells: number;
}

export function summarizeEnvelope(env: Envelope, m: EnvelopeMetric): EnvelopeSummary {
  const ranked = env.cells.filter((c) => c.hours >= MIN_HOURS_RANKED && isNum(metricValue(c, m)) && (metricValue(c, m) as number) > 0);
  if (ranked.length === 0) return { best: null, worst: null, spreadFactor: null, rankedCells: 0 };
  const asc = [...ranked].sort((a, b) => (metricValue(a, m) as number) - (metricValue(b, m) as number));
  const lowest = asc[0];
  const highest = asc[asc.length - 1];
  const best = lowerIsBetter(m) ? lowest : highest;
  const worst = lowerIsBetter(m) ? highest : lowest;
  const spreadFactor = ranked.length > 1 ? (metricValue(highest, m) as number) / (metricValue(lowest, m) as number) : null;
  return { best, worst, spreadFactor, rankedCells: ranked.length };
}

/** 0 (worst) .. 1 (best) position of a value across the ranked cells' span. */
export function goodness(value: number, env: Envelope, m: EnvelopeMetric): number {
  const vals = env.cells
    .filter((c) => c.hours >= MIN_HOURS_RANKED)
    .map((c) => metricValue(c, m))
    .filter(isNum);
  if (vals.length === 0) return 0;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  if (hi === lo) return 0.5;
  const t = Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
  return lowerIsBetter(m) ? 1 - t : t;
}
