// Pure comparison math for the compare page — no React, no I/O — kept out
// of the page component so it can be unit tested.
import { format } from 'date-fns';
import type { HourlyDataRow } from '@/lib/api-client';

export type Measurement = 'total' | 'production' | 'energy' | 'efficiency';
export type VolumeUnit = 'L' | 'gal' | 'acre-ft';

export const LITERS_PER_GALLON = 3.785411784;
export const LITERS_PER_ACRE_FOOT = 1233481.85;
export const UNIT_LABEL: Record<VolumeUnit, string> = { L: 'L', gal: 'gal', 'acre-ft': 'ac-ft' };

export function convertLiters(valueL: number, unit: VolumeUnit): number {
  if (unit === 'gal') return valueL / LITERS_PER_GALLON;
  if (unit === 'acre-ft') return valueL / LITERS_PER_ACRE_FOOT;
  return valueL;
}

// Specific energy consumption is energy PER unit volume, so converting the
// display unit multiplies rather than divides — going from kWh/L to kWh/gal
// means each (larger) gallon costs more kWh, not fewer. The exact inverse
// operation of convertLiters above.
export function convertSpecificEnergy(kWhPerLiter: number, unit: VolumeUnit): number {
  if (unit === 'gal') return kWhPerLiter * LITERS_PER_GALLON;
  if (unit === 'acre-ft') return kWhPerLiter * LITERS_PER_ACRE_FOOT;
  return kWhPerLiter;
}


export interface ChartPoint {
  stationName: string;
  displayName: string;
  mean: number | null;
  std: number | null;
  latest: number | null;
  absHumidity: number | null;
  hasData: boolean;
}


export function formatMeasurementValue(value: number, measurement: Measurement, unit: VolumeUnit): string {
  if (measurement === 'efficiency') return `${value.toFixed(1)}%`;
  if (measurement === 'energy') {
    // kWh/L and kWh/gal are small fractions; kWh/ac-ft is enormous (an
    // acre-foot is ~1.2 million liters) — scale precision to the unit so
    // neither rounds to 0.00 nor prints a wall of decimals.
    const maximumFractionDigits = unit === 'acre-ft' ? 0 : 3;
    return `${value.toLocaleString(undefined, { maximumFractionDigits })} kWh/${UNIT_LABEL[unit]}`;
  }
  const maximumFractionDigits = unit === 'acre-ft' ? 6 : 2;
  return `${value.toLocaleString(undefined, { maximumFractionDigits })} ${UNIT_LABEL[unit]}`;
}


// Total is a ratio of window sums, not an average of hourly percentages —
// same principle as the backend's hourly efficiency formula (a mean-of-ratios
// would let a handful of noisy near-zero-intake hours skew the result;
// summing captured/available first and dividing once doesn't). Efficiency
// and specific energy consumption below are "last data point" snapshots
// instead, since the backend already computes both per-hour — no need to
// re-derive a window ratio for them here. Specific energy consumption
// (kWh per unit volume of water produced — kWh/L, kWh/gal, kWh/ac-ft) is the
// standard way this quantity is expressed; the underlying value stored here
// is always kWh/L, converted to the display unit only when rendered.
export function summarizeWindow(rows: HourlyDataRow[]) {
  let waterL = 0;
  let hasWater = false;
  for (const row of rows) {
    if (row.water_produced_L != null) {
      waterL += row.water_produced_L;
      hasWater = true;
    }
  }

  // Rows arrive chronologically ascending; scan from the end so each metric
  // takes its own most-recent non-null hour independently (one sensor being
  // out shouldn't blank out the other's latest reading).
  let lastEfficiencyPct: number | null = null;
  let lastSpecificEnergyKWhPerL: number | null = null;
  for (let i = rows.length - 1; i >= 0 && (lastEfficiencyPct == null || lastSpecificEnergyKWhPerL == null); i--) {
    if (lastEfficiencyPct == null && rows[i].harvesting_efficiency_pct_hourly != null) {
      lastEfficiencyPct = rows[i].harvesting_efficiency_pct_hourly as number;
    }
    if (lastSpecificEnergyKWhPerL == null && rows[i].energy_per_liter_kWh_L != null) {
      lastSpecificEnergyKWhPerL = rows[i].energy_per_liter_kWh_L;
    }
  }

  return {
    waterProducedL: hasWater ? waterL : null,
    lastEfficiencyPct,
    lastSpecificEnergyKWhPerL,
  };
}


export const DOWNTIME_MIN_HOURS = 2;

// Drops hours that fall inside a run of >= DOWNTIME_MIN_HOURS consecutive
// zero-production hours, so a station's (or a month's) normal idle/powered-
// down stretches don't pull its "production" mean down the way a plain
// average would. This changes what the mean answers: "average output per
// hour including downtime" (unfiltered) vs. "average output per hour while
// actively running" (filtered) — only applied to the `production`
// measurement, since `total` is a sum where a zero hour already contributes
// correctly. Cannot yet distinguish a real idle period (pump off, unit
// powered down) from a dead/frozen sensor reporting a flat zero — both look
// identical as "0 L this hour" from the aggregated data available here.
export function excludeDowntime(rows: HourlyDataRow[]): HourlyDataRow[] {
  const kept: HourlyDataRow[] = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i].water_produced_L === 0) {
      let j = i;
      while (j < rows.length && rows[j].water_produced_L === 0) j++;
      if (j - i < DOWNTIME_MIN_HOURS) kept.push(...rows.slice(i, j));
      i = j;
    } else {
      kept.push(rows[i]);
      i++;
    }
  }
  return kept;
}

// Builds one bar's worth of chart data (mean/std/latest/absHumidity) from a
// set of hourly rows — shared between "compare stations" (one point per
// station, same window) and "compare months" (one point per month, same
// station) since the underlying math is identical either way: only what the
// rows represent differs. Total = sum of hourly values across the range (a
// running total). The other three measurements plot the mean of the hourly
// values +/- one standard deviation, to show how much the rate actually
// varies — a sum has no "variation" to show, so it gets no error bar.
export function buildComparisonPoint(
  key: string,
  displayName: string,
  rows: HourlyDataRow[],
  measurement: Measurement,
  unit: VolumeUnit
): ChartPoint {
  const fieldKey: 'water_produced_L' | 'energy_per_liter_kWh_L' | 'harvesting_efficiency_pct_hourly' =
    measurement === 'energy'
      ? 'energy_per_liter_kWh_L'
      : measurement === 'efficiency'
      ? 'harvesting_efficiency_pct_hourly'
      : 'water_produced_L';

  const effectiveRows = measurement === 'production' ? excludeDowntime(rows) : rows;
  const values = effectiveRows.map((r) => r[fieldKey]).filter((v): v is number => v != null);

  // Mean absolute humidity at intake across the same hours — the ambient
  // condition backing whatever measurement is plotted.
  const ahValues = rows.map((r) => r.abs_humidity_intake_mean).filter((v): v is number => v != null);
  const absHumidity = ahValues.length > 0 ? ahValues.reduce((a, b) => a + b, 0) / ahValues.length : null;

  if (values.length === 0) {
    return { stationName: key, displayName, mean: null, std: null, latest: null, absHumidity, hasData: false };
  }

  const isVolume = measurement === 'total' || measurement === 'production';
  const convert = (v: number) =>
    isVolume ? convertLiters(v, unit) : measurement === 'energy' ? convertSpecificEnergy(v, unit) : v;

  if (measurement === 'total') {
    // A sum-over-the-period has no "latest single hour" worth comparing it
    // against — that comparison only makes sense for a rate/ratio.
    const sum = values.reduce((a, b) => a + b, 0);
    return { stationName: key, displayName, mean: convert(sum), std: null, latest: null, absHumidity, hasData: true };
  }

  const rawMean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.length > 1 ? values.reduce((acc, v) => acc + (v - rawMean) ** 2, 0) / (values.length - 1) : 0;
  const rawStd = Math.sqrt(variance);
  // rows (and therefore values, mapped/filtered in the same order) arrive
  // chronologically ascending, so the last element is the most recent
  // non-null hour — the "right now" reading, vs. the bar's period mean.
  const rawLatest = values[values.length - 1];

  return {
    stationName: key,
    displayName,
    mean: convert(rawMean),
    std: convert(rawStd),
    latest: convert(rawLatest),
    absHumidity,
    hasData: true,
  };
}

// A selected month is stored as its "yyyy-MM" key (sorts/dedupes as a plain
// string, and round-trips through the DatePicker's Date value cleanly).
export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return format(new Date(y, m - 1, 1), 'MMM yyyy');
}

// Calendar-month boundaries in UTC, passed straight through as the /hourly
// start_date/end_date filter — same ISO-string contract the rest of this
// page already uses for date-range fetches.
export function monthRangeISO(key: string): { start: string; end: string } {
  const [y, m] = key.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)); // day 0 of next month = last day of this one
  return { start: start.toISOString(), end: end.toISOString() };
}

