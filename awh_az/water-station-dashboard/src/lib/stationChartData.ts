// Pure data-shaping for the station detail page. No React, no I/O — kept
// separate from the page so it can be unit tested.
import type { StationReading } from '@/lib/api-client';
import type { ChartDataPoint } from '@/types';
import {
  fieldCategories,
  fieldDisplayNames,
  AWH_DUCT_AREA_M2,
  WEIGHT_NOISE_FLOOR_G,
  ENERGY_SANITY_CEILING_KWH,
  computeAbsHumidity,
  velocityToMps,
} from '@/lib/stationFields';

/** Chartable parameters for a station, grouped by category. */
export function buildParameterCategories(availableFields: string[]): Record<string, string[]> {
  const categories: Record<string, string[]> = {};
  const push = (category: string, field: string) => {
    if (!categories[category]) categories[category] = [];
    if (!categories[category].includes(field)) categories[category].push(field);
  };
  const has = (f: string) => availableFields.includes(f);

  availableFields.forEach(field => {
    // Exclude raw weight from chart selector — replaced by cumulative water production
    if (field === 'weight') return;
    const category = fieldCategories[field];
    if (category && fieldDisplayNames[field]) push(category, field);
  });

  // Computed abs humidity fields (derived from base readings)
  if (has('temperature') && has('humidity')) push('Air Conditions', 'abs_humidity_intake');
  if (has('outtake_temperature') && has('outtake_humidity')) push('Air Conditions', 'abs_humidity_outtake');

  // Replace raw weight (g) with cumulative water production (L)
  if (has('weight')) push('Water Production', 'accumulated_water_L');

  if (has('temperature') && has('humidity') && has('velocity') && has('weight')) {
    push('Efficiency', 'harvesting_efficiency');
  }

  return categories;
}

/**
 * One independent data series per selected parameter — rendered as separate
 * graphs rather than overlaid, so each parameter reads at its own scale.
 */
export function buildChartSeries(
  readings: StationReading[],
  startDate: Date | null,
  endDate: Date | null,
  selectedParameters: string[]
): { field: string; data: ChartDataPoint[] }[] {
  if (!startDate || !endDate || selectedParameters.length === 0 || readings.length === 0) return [];

  const start = startDate.getTime();
  const end = endDate.getTime();

  const filteredReadings = readings.filter(reading => {
    const t = new Date(reading.timestamp).getTime();
    return t >= start && t <= end;
  });

  // Sort ascending by timestamp (API returns descending)
  filteredReadings.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Cumulative water production (L) for accumulated_water_L
  const accWaterMap = new Map<string, number>();
  let runningWaterG = 0;
  let prevW: number | null = null;
  filteredReadings.forEach(r => {
    const w = typeof r.weight === 'number' ? r.weight : null;
    if (w !== null) {
      const delta = prevW !== null ? w - prevW : 0;
      runningWaterG += delta >= WEIGHT_NOISE_FLOOR_G ? delta : 0;
      prevW = w;
    }
    accWaterMap.set(r.timestamp, Math.round(runningWaterG / 1000 * 1000000) / 1000000);
  });

  // Incremental energy (kWh) per reading. `reading.energy` is already
  // cumulative kWh at the source (RPi_USB_Package/read_power*.py convert
  // on-device) — this used to divide by 1000 again on top of that, which
  // silently undercounted every station's displayed energy by 1000x.
  // Note: per guides/KNOWN_ISSUES.md #7, at least one station's driver
  // (station_AquaPars@PowerPlant's deployed read_power.py) is confirmed
  // still uploading raw Wh instead of kWh, and its raw energy register
  // also wraps at ~65.5 kWh — this per-reading chart can't correct either
  // of those (that needs the Pi-side fix described there); it's accurate
  // for stations already uploading real kWh (e.g. station_testbed_1).
  const incEnergyMap = new Map<string, number | null>();
  let prevE: number | null = null;
  filteredReadings.forEach(r => {
    const raw = typeof r.energy === 'number' ? r.energy : null;
    // A known-corrupt reading (see ENERGY_SANITY_CEILING_KWH) is treated the
    // same as a missing one: skip it, don't fold it into a delta, and don't
    // let it become the new "previous" pointer either — otherwise the reading
    // right after it would show a bogus giant swing.
    const e = raw !== null && raw <= ENERGY_SANITY_CEILING_KWH ? raw : null;
    if (e !== null) {
      incEnergyMap.set(r.timestamp, prevE !== null ? Math.max(e - prevE, 0) : 0);
      prevE = e;
    } else {
      incEnergyMap.set(r.timestamp, null);
    }
  });

  // Incremental water (g) per reading for harvesting efficiency
  const incWaterMap = new Map<string, number>();
  let prevWeff: number | null = null;
  filteredReadings.forEach(r => {
    const w = typeof r.weight === 'number' ? r.weight : null;
    if (w !== null) {
      const delta = prevWeff !== null ? w - prevWeff : 0;
      incWaterMap.set(r.timestamp, delta >= WEIGHT_NOISE_FLOOR_G ? delta : 0);
      prevWeff = w;
    } else {
      incWaterMap.set(r.timestamp, 0);
    }
  });

  // Harvesting efficiency (%) per reading
  // Formula: incremental_water_g / (abs_humidity × velocity_mps × DUCT_AREA × Δt_s) × 100
  const effMap = new Map<string, number>();
  filteredReadings.forEach((r, i) => {
    const absH = typeof r.temperature === 'number' && typeof r.humidity === 'number'
      ? computeAbsHumidity(r.temperature, r.humidity) : null;
    const vel = typeof r.velocity === 'number' ? r.velocity : null;
    const incW = incWaterMap.get(r.timestamp) ?? 0;
    if (absH !== null && vel !== null && absH > 0 && vel > 0) {
      // Δt: use actual gap between readings, fallback 30s
      const dtMs = i > 0
        ? new Date(r.timestamp).getTime() - new Date(filteredReadings[i - 1].timestamp).getTime()
        : 30000;
      const dtS = Math.min(dtMs / 1000, 120); // cap at 2 min to avoid gaps inflating result
      const velMps = velocityToMps(vel, r.unit);
      const intakeWaterG = absH * velMps * AWH_DUCT_AREA_M2 * dtS;
      const eff = intakeWaterG > 0 ? Math.min((incW / intakeWaterG) * 100, 100) : 0;
      effMap.set(r.timestamp, Math.round(eff * 10000) / 10000);
    } else {
      effMap.set(r.timestamp, 0);
    }
  });

  // Resolve a field value, computing derived fields on the fly if needed
  const resolveValue = (reading: StationReading, field: string): number | null => {
    if (field === 'abs_humidity_intake') {
      const t = reading.temperature, h = reading.humidity;
      return typeof t === 'number' && typeof h === 'number' ? computeAbsHumidity(t, h) : null;
    }
    if (field === 'abs_humidity_outtake') {
      const t = reading.outtake_temperature, h = reading.outtake_humidity;
      return typeof t === 'number' && typeof h === 'number' ? computeAbsHumidity(t, h) : null;
    }
    if (field === 'accumulated_water_L') return accWaterMap.get(reading.timestamp) ?? 0;
    if (field === 'incremental_water_g') return incWaterMap.get(reading.timestamp) ?? 0;
    if (field === 'incremental_energy_kWh') return incEnergyMap.get(reading.timestamp) ?? null;
    if (field === 'harvesting_efficiency') return effMap.get(reading.timestamp) ?? 0;
    if (field === 'energy') {
      // Already kWh at the source. Values above ENERGY_SANITY_CEILING_KWH are
      // known-corrupt and plotted as a gap rather than a wildly-wrong number.
      if (typeof reading.energy !== 'number') return null;
      return reading.energy <= ENERGY_SANITY_CEILING_KWH ? reading.energy : null;
    }
    // A reading with no value for this field is a gap in the line, not a
    // measurement of zero — plotting it as 0 draws false spikes to the floor.
    const v = reading[field as keyof StationReading];
    return typeof v === 'number' ? v : null;
  };

  return selectedParameters.map(field => ({
    field,
    data: filteredReadings.map(reading => ({
      date: reading.timestamp,
      value: resolveValue(reading, field),
    })),
  }));
}
