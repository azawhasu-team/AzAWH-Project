// Field metadata shared between the station detail page (charts) and the
// admin data-download panel — kept in one place so the two don't drift
// (they used to duplicate this table independently).

// Field mapping: API field names to display names
export const fieldDisplayNames: Record<string, string> = {
  temperature: 'Temperature (Intake)',
  humidity: 'Relative Humidity (Intake)',
  velocity: 'Air Velocity (Intake)',
  abs_humidity_intake: 'Absolute Humidity (Intake)',
  outtake_temperature: 'Temperature (Outtake)',
  outtake_humidity: 'Relative Humidity (Outtake)',
  outtake_velocity: 'Air Velocity (Outtake)',
  abs_humidity_outtake: 'Absolute Humidity (Outtake)',
  flow_lmin: 'Flow Rate',
  flow_hz: 'Flow Frequency',
  flow_total: 'Total Flow',
  weight: 'Weight',
  accumulated_water_L: 'Cumulative Water Production',
  incremental_water_g: 'Incremental Water Production',
  power: 'Power',
  voltage: 'Voltage',
  current: 'Current',
  energy: 'Energy',
  incremental_energy_kWh: 'Incremental Energy',
  pump_status: 'Pump Status',
  harvesting_efficiency: 'Harvesting Efficiency',
};

// Units for each field — shown on chart Y-axis labels and tooltips
export const fieldUnits: Record<string, string> = {
  temperature: '°C',
  humidity: '%',
  velocity: 'm/s',
  abs_humidity_intake: 'g/m³',
  outtake_temperature: '°C',
  outtake_humidity: '%',
  outtake_velocity: 'm/s',
  abs_humidity_outtake: 'g/m³',
  flow_lmin: 'L/min',
  flow_hz: 'Hz',
  flow_total: 'L',
  weight: 'g',
  accumulated_water_L: 'L',
  incremental_water_g: 'g',
  power: 'W',
  voltage: 'V',
  current: 'A',
  energy: 'kWh',
  incremental_energy_kWh: 'kWh',
  pump_status: '',
  harvesting_efficiency: '%',
};

// Computed fields — derived client-side from base readings
export const COMPUTED_FIELDS = new Set([
  'abs_humidity_intake',
  'abs_humidity_outtake',
  'accumulated_water_L',
  'incremental_water_g',
  'incremental_energy_kWh',
  'harvesting_efficiency',
]);

// Field categories for grouping
export const fieldCategories: Record<string, string> = {
  temperature: 'Air Conditions',
  humidity: 'Air Conditions',
  velocity: 'Air Conditions',
  abs_humidity_intake: 'Air Conditions',
  outtake_temperature: 'Air Conditions',
  outtake_humidity: 'Air Conditions',
  outtake_velocity: 'Air Conditions',
  abs_humidity_outtake: 'Air Conditions',
  flow_lmin: 'Water Production',
  flow_hz: 'Water Production',
  flow_total: 'Water Production',
  weight: 'Water Production',
  accumulated_water_L: 'Water Production',
  incremental_water_g: 'Water Production',
  harvesting_efficiency: 'Efficiency',
  power: 'Power Consumption',
  voltage: 'Power Consumption',
  current: 'Power Consumption',
  energy: 'Power Consumption',
  incremental_energy_kWh: 'Power Consumption',
  pump_status: 'System',
};

// AWH device duct cross-sectional area (m²) — from hardware spec (273.60 sq in = 0.18 m²)
export const AWH_DUCT_AREA_M2 = 0.18;

// Minimum weight increment (g) counted as real water production, not balance jitter.
// Some stations' readings wobble ±5-25g between consecutive readings with no real
// accumulating trend (confirmed on station_testbed_1: true net change over 2 days was
// ~170g, but summing every positive wobble gave ~9000g — a ~50x overcount). 15g sits
// well below the real per-step jumps seen on a working station's pump-drain cycles
// (station_AquaPars@PowerPlant's positive deltas are ~99.7% above this floor) while
// filtering out most of the noise-only jitter. Keep in sync with the same constant in
// awh_az/backend/main.py's hourly aggregation.
export const WEIGHT_NOISE_FLOOR_G = 15;

// Raw `energy` readings above this are known-corrupt, not real cumulative
// kWh: per guides/KNOWN_ISSUES.md #7, station_testbed_1 has a stretch of
// pre-2026-07-14 data written under a driver bug that produced values in
// the 140,000+ range (confirmed as high as ~4.6M in the raw feed), and
// that data is explicitly documented as unrecoverable garbage, not a unit
// mismatch to correct for. These stations draw ~1-1.5kW continuously, so
// even years of nonstop operation stays well under five figures of kWh —
// 50,000 is a generous ceiling that only excludes data already known bad.
export const ENERGY_SANITY_CEILING_KWH = 50000;

// Magnus formula helper for absolute humidity (g/m³)
export function computeAbsHumidity(tempC: number, rhPct: number): number {
  const es = 6.112 * Math.exp((17.67 * tempC) / (tempC + 243.5));
  return (216.7 * (rhPct / 100) * es) / (273.15 + tempC);
}

// Normalize anemometer velocity to m/s before using it in physical formulas.
export function velocityToMps(velocity: number, unit?: string | null): number {
  const u = (unit || '').toLowerCase();
  if (u === 'km/h') return velocity / 3.6;
  if (u === 'mph') return velocity / 2.23694;
  if (u === 'ft/s') return velocity / 3.28084;
  if (u === 'ft/m') return velocity / 196.850394;
  return velocity; // default and 'm/s'
}
