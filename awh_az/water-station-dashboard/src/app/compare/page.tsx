'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Skeleton,
  Alert,
  ToggleButton,
  ToggleButtonGroup,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  type SelectChangeEvent,
} from '@mui/material';
import {
  WaterDrop,
  Bolt,
  Speed,
  SensorsRounded,
  WifiTethering,
  EmojiEvents,
  CalendarMonth,
  TuneRounded,
} from '@mui/icons-material';
import { motion } from 'framer-motion';
import {
  ComposedChart,
  Bar,
  ErrorBar,
  LabelList,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { format } from 'date-fns';
import { apiClient, type StationInfo, type HourlyDataRow } from '@/lib/api-client';
import { formatPhoenixMonthDayTime } from '@/lib/timezone';
import { filterVisibleStations } from '@/lib/hiddenStations';

/**
 * A compact bar showing this station's value relative to the highest value
 * in the column (not a pass/fail gauge against an invented target — there's
 * no established "good" threshold for e.g. harvesting efficiency, so a
 * red/yellow/green bullet chart would be fabricating a judgment the science
 * doesn't support). The number is always rendered as text, never
 * color-only, per standard chart-accessibility guidance.
 */
function MetricBar({
  value,
  max,
  label,
  color,
}: {
  value: number | null;
  max: number;
  label: string;
  color: string;
}) {
  if (value == null) {
    return <Typography sx={{ color: 'text.disabled', fontSize: '0.85rem' }}>—</Typography>;
  }
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4, minWidth: 120 }}>
      <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', fontVariantNumeric: 'tabular-nums' }}>
        {label}
      </Typography>
      <Box sx={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <Box sx={{ height: '100%', width: `${pct}%`, borderRadius: 3, backgroundColor: color, transition: 'width 300ms ease' }} />
      </Box>
    </Box>
  );
}

interface StationComparison {
  station: StationInfo;
  waterProducedL: number | null;
  lastEfficiencyPct: number | null;
  lastSpecificEnergyKWhPerL: number | null;
  hasRecentData: boolean;
}

const WINDOW_DAYS = 7;

// Same thresholds/labels/colors as the station detail page's Live Status
// widget — one freshness vocabulary across the app, not a second one
// invented for this page.
function freshnessOf(lastReading: string | null | undefined) {
  if (!lastReading) return { label: 'Waiting for data', color: '#9e9e9e' };
  const ageSec = Math.max(0, (Date.now() - new Date(lastReading).getTime()) / 1000);
  if (ageSec < 120) return { label: 'Live', color: '#2e7d32', ageSec };
  if (ageSec < 600) return { label: 'Delayed', color: '#ed6c02', ageSec };
  return { label: 'Not sending', color: '#c62828', ageSec };
}

function formatAge(ageSec: number | undefined): string {
  if (ageSec == null) return '';
  if (ageSec < 60) return `${Math.floor(ageSec)}s ago`;
  if (ageSec < 3600) return `${Math.floor(ageSec / 60)}m ago`;
  if (ageSec < 86400) return `${Math.floor(ageSec / 3600)}h ago`;
  return `${Math.floor(ageSec / 86400)}d ago`;
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
function summarizeWindow(rows: HourlyDataRow[]) {
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

// --- Top panel: configurable bar chart -------------------------------------

type Measurement = 'total' | 'production' | 'energy' | 'efficiency';
type VolumeUnit = 'L' | 'gal' | 'acre-ft';
type RangePreset = '7d' | '30d' | '90d' | 'custom';

const MEASUREMENTS: { key: Measurement; label: string; color: string; colorEnd: string; usesVolumeUnit: boolean; Icon: typeof WaterDrop }[] = [
  { key: 'total', label: 'Total water produced', color: '#901340', colorEnd: '#c94a76', usesVolumeUnit: true, Icon: WaterDrop },
  { key: 'production', label: 'Water production', color: '#901340', colorEnd: '#c94a76', usesVolumeUnit: true, Icon: WaterDrop },
  { key: 'energy', label: 'Specific energy consumption', color: '#4a5bc4', colorEnd: '#7c8ae0', usesVolumeUnit: true, Icon: Bolt },
  { key: 'efficiency', label: 'Harvesting efficiency', color: '#e0a800', colorEnd: '#ffd75c', usesVolumeUnit: false, Icon: Speed },
];

// Small alpha-blended tint of a brand hex color, for chip/stat-tile backgrounds —
// keeps every accent color tied to the same hue used for its bar/badge elsewhere
// on the page instead of inventing a second palette.
function tint(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Pill-style ToggleButtonGroup themed to whichever accent color is active
// (date range = blue, unit = the active measurement's color), consistent
// with "color follows the entity" rather than a generic gray MUI default.
function rangeToggleSx(color: string) {
  return {
    backgroundColor: 'white',
    borderRadius: 2,
    '& .MuiToggleButton-root': {
      border: '1px solid rgba(0,0,0,0.1)',
      fontWeight: 700,
      fontSize: '0.78rem',
      color: 'text.secondary',
      px: 1.5,
      '&.Mui-selected': {
        backgroundColor: tint(color, 0.14),
        color,
        '&:hover': { backgroundColor: tint(color, 0.2) },
      },
    },
  };
}

const RANGE_PRESET_DAYS: Record<Exclude<RangePreset, 'custom'>, number> = { '7d': 7, '30d': 30, '90d': 90 };

// Absolute humidity at intake — the ambient moisture actually available to be
// harvested. Shown as environmental context alongside whichever measurement
// is selected, since water production and energy draw both depend on it. A
// distinct hue outside the four measurement colors, since it's a different
// kind of variable (a condition, not a harvest metric).
const HUMIDITY_COLOR = '#00acc1';

function formatHumidity(value: number): string {
  return `${value.toFixed(1)} g/m³`;
}

const LITERS_PER_GALLON = 3.785411784;
const LITERS_PER_ACRE_FOOT = 1233481.85;
const UNIT_LABEL: Record<VolumeUnit, string> = { L: 'L', gal: 'gal', 'acre-ft': 'ac-ft' };

function convertLiters(valueL: number, unit: VolumeUnit): number {
  if (unit === 'gal') return valueL / LITERS_PER_GALLON;
  if (unit === 'acre-ft') return valueL / LITERS_PER_ACRE_FOOT;
  return valueL;
}

// Specific energy consumption is energy PER unit volume, so converting the
// display unit multiplies rather than divides — going from kWh/L to kWh/gal
// means each (larger) gallon costs more kWh, not fewer. The exact inverse
// operation of convertLiters above.
function convertSpecificEnergy(kWhPerLiter: number, unit: VolumeUnit): number {
  if (unit === 'gal') return kWhPerLiter * LITERS_PER_GALLON;
  if (unit === 'acre-ft') return kWhPerLiter * LITERS_PER_ACRE_FOOT;
  return kWhPerLiter;
}

function formatMeasurementValue(value: number, measurement: Measurement, unit: VolumeUnit): string {
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

interface ChartPoint {
  stationName: string;
  displayName: string;
  mean: number | null;
  std: number | null;
  latest: number | null;
  absHumidity: number | null;
  hasData: boolean;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
  measurement: Measurement;
  unit: VolumeUnit;
  color: string;
  showHumidity?: boolean;
}

function ChartTooltip({ active, payload, measurement, unit, color, showHumidity }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  if (point.mean == null) return null;
  return (
    <Box
      sx={{
        backgroundColor: 'rgba(255,255,255,0.98)',
        border: '1px solid rgba(0,0,0,0.08)',
        borderRadius: '12px',
        boxShadow: '0 12px 32px rgba(0,0,0,0.16)',
        padding: '12px 16px',
        borderTop: `3px solid ${color}`,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Box sx={{ width: 10, height: 10, borderRadius: '3px', backgroundColor: color, flexShrink: 0 }} />
        <Typography sx={{ fontWeight: 800, fontSize: '1rem' }}>
          {formatMeasurementValue(point.mean, measurement, unit)}
        </Typography>
      </Box>
      {point.std != null && (
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
          ± {formatMeasurementValue(point.std, measurement, unit)} (1 std dev)
        </Typography>
      )}
      {point.latest != null && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.5 }}>
          <Box sx={{ width: 14, height: 2, backgroundColor: '#1a1a1a', flexShrink: 0 }} />
          <Typography variant="caption" sx={{ fontWeight: 700 }}>
            {formatMeasurementValue(point.latest, measurement, unit)}{' '}
            <Box component="span" sx={{ color: 'text.secondary', fontWeight: 500 }}>latest hour</Box>
          </Typography>
        </Box>
      )}
      {showHumidity && point.absHumidity != null && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.75 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '3px', backgroundColor: HUMIDITY_COLOR, flexShrink: 0 }} />
          <Typography variant="caption" sx={{ fontWeight: 700 }}>
            {formatHumidity(point.absHumidity)} <Box component="span" sx={{ color: 'text.secondary', fontWeight: 500 }}>abs. humidity</Box>
          </Typography>
        </Box>
      )}
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, fontWeight: 700 }}>
        {point.displayName}
      </Typography>
    </Box>
  );
}

function StatTile({
  icon,
  label,
  value,
  subLabel,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subLabel?: string;
  color: string;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 2.5,
        border: '1px solid rgba(0,0,0,0.07)',
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.75,
        transition: 'transform 200ms ease, box-shadow 200ms ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: `0 10px 24px ${tint(color, 0.16)}`,
        },
      }}
    >
      <Box
        sx={{
          width: 32,
          height: 32,
          borderRadius: '9px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tint(color, 0.12),
          color,
        }}
      >
        {icon}
      </Box>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3, fontSize: '0.68rem' }}>
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 800, fontSize: '1.35rem', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
        {value}
      </Typography>
      {subLabel && (
        <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 600 }}>
          {subLabel}
        </Typography>
      )}
    </Paper>
  );
}

export default function ComparePage() {
  const [stations, setStations] = useState<StationInfo[]>([]);
  const [tableRows, setTableRows] = useState<StationComparison[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Top panel controls
  const [rangePreset, setRangePreset] = useState<RangePreset>('7d');
  const [customStart, setCustomStart] = useState<Date | null>(null);
  const [customEnd, setCustomEnd] = useState<Date | null>(null);
  const [measurement, setMeasurement] = useState<Measurement>('total');
  const [unit, setUnit] = useState<VolumeUnit>('L');

  const [chartHourly, setChartHourly] = useState<Record<string, HourlyDataRow[]>>({});
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState<string | null>(null);
  const [slowLoad, setSlowLoad] = useState(false);

  // Caches the raw hourly rows fetched for the fixed WINDOW_DAYS table below,
  // keyed by station name. The chart's default view covers the same window
  // (rangePreset 'd' === WINDOW_DAYS), so we reuse this instead of paying for
  // a second identical fetch — each hourly call can take 30s+ when the
  // backend is on its Firestore fallback (Postgres unreachable from Render),
  // so avoiding a redundant one roughly halves first-load time.
  const initialHourlyRef = useRef<Record<string, HourlyDataRow[]> | null>(null);

  // Load the station list + the fixed-window bottom table once.
  useEffect(() => {
    let slowTimer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        setLoading(true);
        slowTimer = setTimeout(() => setSlowLoad(true), 6000);
        const stationList = filterVisibleStations(await apiClient.getStations());
        const startDate = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

        const hourlyByStation: Record<string, HourlyDataRow[]> = {};
        const results = await Promise.all(
          stationList.map(async (station): Promise<StationComparison> => {
            try {
              const hourly = await apiClient.getHourlyAggregation(station.station_name, { start_date: startDate });
              hourlyByStation[station.station_name] = hourly.data;
              const summary = summarizeWindow(hourly.data);
              return {
                station,
                waterProducedL: summary.waterProducedL,
                lastEfficiencyPct: summary.lastEfficiencyPct,
                lastSpecificEnergyKWhPerL: summary.lastSpecificEnergyKWhPerL,
                hasRecentData: hourly.data.length > 0,
              };
            } catch {
              // 404 (no readings in range) is expected for long-inactive stations —
              // show them as "no data," not as a page-level error.
              hourlyByStation[station.station_name] = [];
              return {
                station,
                waterProducedL: null,
                lastEfficiencyPct: null,
                lastSpecificEnergyKWhPerL: null,
                hasRecentData: false,
              };
            }
          })
        );

        // Online stations first (stable partition), then by water produced
        // within each group — so an active station never gets buried below
        // a wall of offline ones just because it produced less this window.
        results.sort((a, b) => {
          const aOnline = a.station.status === 'active';
          const bOnline = b.station.status === 'active';
          if (aOnline !== bOnline) return aOnline ? -1 : 1;
          return (b.waterProducedL ?? -1) - (a.waterProducedL ?? -1);
        });
        initialHourlyRef.current = hourlyByStation;
        setStations(stationList);
        setTableRows(results);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load station comparison');
      } finally {
        setLoading(false);
        setSlowLoad(false);
        clearTimeout(slowTimer);
      }
    }
    load();
    return () => clearTimeout(slowTimer);
  }, []);

  const { rangeStartISO, rangeEndISO, rangeLabel } = useMemo(() => {
    if (rangePreset === 'custom') {
      if (!customStart || !customEnd) {
        return { rangeStartISO: null, rangeEndISO: null, rangeLabel: 'Pick a custom range' };
      }
      return {
        rangeStartISO: customStart.toISOString(),
        rangeEndISO: customEnd.toISOString(),
        rangeLabel: `${format(customStart, 'MMM d, yyyy')} – ${format(customEnd, 'MMM d, yyyy')}`,
      };
    }
    const days = RANGE_PRESET_DAYS[rangePreset];
    const end = new Date();
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return { rangeStartISO: start.toISOString(), rangeEndISO: end.toISOString(), rangeLabel: `Last ${days} days` };
  }, [rangePreset, customStart, customEnd]);

  // Re-fetch hourly data for the chart whenever the selected range changes.
  // Deliberately independent of the bottom table's fixed WINDOW_DAYS fetch.
  useEffect(() => {
    if (!rangeStartISO || !rangeEndISO || stations.length === 0) return;
    let cancelled = false;

    // The default range matches the table's fixed WINDOW_DAYS fetch exactly —
    // reuse that data instead of re-fetching the same hourly rows a second time.
    if (rangePreset === '7d' && initialHourlyRef.current) {
      setChartHourly(initialHourlyRef.current);
      setChartError(null);
      setChartLoading(false);
      return;
    }

    async function loadChart() {
      setChartLoading(true);
      try {
        const results = await Promise.all(
          stations.map(async (station) => {
            try {
              const hourly = await apiClient.getHourlyAggregation(station.station_name, {
                start_date: rangeStartISO!,
                end_date: rangeEndISO!,
              });
              return [station.station_name, hourly.data] as const;
            } catch {
              return [station.station_name, []] as const;
            }
          })
        );
        if (cancelled) return;
        setChartHourly(Object.fromEntries(results));
        setChartError(null);
      } catch (err) {
        if (!cancelled) setChartError(err instanceof Error ? err.message : 'Failed to load chart data');
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    }
    loadChart();
    return () => {
      cancelled = true;
    };
  }, [stations, rangeStartISO, rangeEndISO, rangePreset]);

  const activeMeasurement = MEASUREMENTS.find((m) => m.key === measurement)!;

  // Total = sum of hourly values across the range (a running total, same
  // quantity as the bottom table's Water Produced column). The other three
  // measurements plot the mean of the hourly values +/- one standard
  // deviation, to show how much each station's hourly rate actually varies
  // — a sum has no "variation" to show, so it gets no error bar.
  const chartData: ChartPoint[] = useMemo(() => {
    const fieldKey: 'water_produced_L' | 'energy_per_liter_kWh_L' | 'harvesting_efficiency_pct_hourly' =
      measurement === 'energy'
        ? 'energy_per_liter_kWh_L'
        : measurement === 'efficiency'
        ? 'harvesting_efficiency_pct_hourly'
        : 'water_produced_L';

    return stations.map((station) => {
      const displayName = station.station_name.replace(/^station_/, '');
      const rows = chartHourly[station.station_name] || [];
      const values = rows.map((r) => r[fieldKey]).filter((v): v is number => v != null);

      // Mean absolute humidity at intake across the same hours — the ambient
      // condition backing whatever measurement is plotted. Computed here
      // (not fetched separately) since chartHourly already carries it.
      const ahValues = rows.map((r) => r.abs_humidity_intake_mean).filter((v): v is number => v != null);
      const absHumidity = ahValues.length > 0 ? ahValues.reduce((a, b) => a + b, 0) / ahValues.length : null;

      if (values.length === 0) {
        return { stationName: station.station_name, displayName, mean: null, std: null, latest: null, absHumidity, hasData: false };
      }

      const isVolume = measurement === 'total' || measurement === 'production';
      const convert = (v: number) =>
        isVolume ? convertLiters(v, unit) : measurement === 'energy' ? convertSpecificEnergy(v, unit) : v;

      if (measurement === 'total') {
        // A sum-over-the-period has no "latest single hour" worth comparing
        // it against — that comparison only makes sense for a rate/ratio.
        const sum = values.reduce((a, b) => a + b, 0);
        return { stationName: station.station_name, displayName, mean: convert(sum), std: null, latest: null, absHumidity, hasData: true };
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
        stationName: station.station_name,
        displayName,
        mean: convert(rawMean),
        std: convert(rawStd),
        latest: convert(rawLatest),
        absHumidity,
        hasData: true,
      };
    });
  }, [stations, chartHourly, measurement, unit]);

  const plottedData = chartData.filter((d) => d.hasData);
  const missingCount = chartData.length - plottedData.length;
  const yUnitLabel = measurement === 'energy' ? `kWh/${UNIT_LABEL[unit]}` : measurement === 'efficiency' ? '%' : UNIT_LABEL[unit];

  const quickStats = useMemo(() => {
    const liveCount = tableRows.filter((r) => freshnessOf(r.station.metadata.last_reading).label === 'Live').length;
    const reportingCount = tableRows.filter((r) => r.hasRecentData).length;
    const totalWaterL = tableRows.reduce((sum, r) => sum + (r.waterProducedL ?? 0), 0);
    const topPoint = plottedData.reduce<ChartPoint | null>((best, p) => {
      if (p.mean == null) return best;
      if (!best || best.mean == null || p.mean > best.mean) return p;
      return best;
    }, null);
    return { liveCount, reportingCount, totalStations: tableRows.length, totalWaterL, topPoint };
  }, [tableRows, plottedData]);

  if (loading) {
    return (
      <Box sx={{ px: { xs: 2, sm: 3, md: 4 }, py: 6, maxWidth: '1200px', mx: 'auto' }}>
        <Skeleton variant="text" width={280} height={48} sx={{ mx: 'auto', mb: 1 }} />
        <Skeleton variant="text" width={460} height={28} sx={{ mx: 'auto', mb: slowLoad ? 1 : 5 }} />
        {slowLoad && (
          <Typography
            variant="body2"
            align="center"
            sx={{ color: 'text.secondary', mb: 4 }}
          >
            Still loading — this can take up to a minute right now while the backend
            recomputes station data without its usual fast database connection.
          </Typography>
        )}
        <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid rgba(0,0,0,0.08)', p: 2 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Box key={i} sx={{ display: 'flex', gap: 3, alignItems: 'center', py: 1.5 }}>
              <Skeleton variant="text" width={200} height={32} />
              <Skeleton variant="rounded" width={70} height={24} />
              <Skeleton variant="rounded" width={120} height={36} sx={{ ml: 'auto' }} />
              <Skeleton variant="rounded" width={120} height={36} />
              <Skeleton variant="rounded" width={120} height={36} />
              <Skeleton variant="text" width={90} height={32} />
            </Box>
          ))}
        </Paper>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error" sx={{ maxWidth: 600, mx: 'auto' }}>{error}</Alert>
      </Box>
    );
  }

  const maxWater = Math.max(0, ...tableRows.map((r) => r.waterProducedL ?? 0));
  const maxEfficiency = Math.max(0, ...tableRows.map((r) => r.lastEfficiencyPct ?? 0));
  const maxSpecificEnergy = Math.max(0, ...tableRows.map((r) => r.lastSpecificEnergyKWhPerL ?? 0));
  // tableRows is sorted online-first, so this is the boundary where a
  // divider row belongs — 0 or -1 (no offline stations at all) means skip it.
  const firstOfflineIndex = tableRows.findIndex((r) => r.station.status !== 'active');

  return (
    <Box
      sx={{
        px: { xs: 2, sm: 3, md: 4 },
        py: 6,
        maxWidth: '1200px',
        mx: 'auto',
        background: 'radial-gradient(1200px 400px at 50% -80px, rgba(144,19,64,0.05), transparent)',
      }}
    >
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 800,
            mb: 1,
            textAlign: 'center',
            background: 'linear-gradient(90deg, #901340, #5c6bc0)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Compare Stations
        </Typography>
        <Typography variant="body1" sx={{ color: '#484848', mb: 4, textAlign: 'center' }}>
          Water produced, harvesting efficiency, and specific energy consumption across every station
        </Typography>
      </motion.div>

      {tableRows.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.05 }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
              gap: 2,
              mb: 4,
            }}
          >
            <StatTile
              icon={<SensorsRounded sx={{ fontSize: 20 }} />}
              label="Stations reporting"
              value={`${quickStats.reportingCount} / ${quickStats.totalStations}`}
              color="#1e88e5"
            />
            <StatTile
              icon={<WifiTethering sx={{ fontSize: 20 }} />}
              label="Live now"
              value={String(quickStats.liveCount)}
              color="#2e7d32"
            />
            <StatTile
              icon={<WaterDrop sx={{ fontSize: 20 }} />}
              label={`Total water (${WINDOW_DAYS}d)`}
              value={`${quickStats.totalWaterL.toLocaleString(undefined, { maximumFractionDigits: 0 })} L`}
              color="#901340"
            />
            <StatTile
              icon={<EmojiEvents sx={{ fontSize: 20 }} />}
              label={`Top · ${activeMeasurement.label}`}
              value={quickStats.topPoint?.mean != null ? formatMeasurementValue(quickStats.topPoint.mean, measurement, unit) : '—'}
              subLabel={quickStats.topPoint?.displayName}
              color={activeMeasurement.color}
            />
          </Box>
        </motion.div>
      )}

      {stations.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
        <Paper
          elevation={0}
          sx={{
            borderRadius: 3,
            border: '1px solid rgba(0,0,0,0.08)',
            p: { xs: 2.5, md: 3.5 },
            mb: 4,
            position: 'relative',
            overflow: 'hidden',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 4,
              background: `linear-gradient(90deg, ${activeMeasurement.color}, ${activeMeasurement.colorEnd})`,
              transition: 'background 300ms ease',
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
            <Box
              sx={{
                width: 30,
                height: 30,
                borderRadius: '9px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: tint(activeMeasurement.color, 0.12),
                color: activeMeasurement.color,
                transition: 'background-color 300ms ease, color 300ms ease',
              }}
            >
              <activeMeasurement.Icon sx={{ fontSize: 18 }} />
            </Box>
            <Typography sx={{ fontWeight: 700, fontSize: '1.05rem' }}>
              Water Harvested
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3, ml: 4.75 }}>
            {activeMeasurement.label} · {rangeLabel} · by station
          </Typography>

          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 2,
              alignItems: 'center',
              mb: 3,
              p: 2,
              borderRadius: 2.5,
              backgroundColor: 'rgba(0,0,0,0.02)',
              border: '1px solid rgba(0,0,0,0.05)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CalendarMonth sx={{ fontSize: 18, color: 'text.disabled' }} />
              <ToggleButtonGroup
                exclusive
                size="small"
                value={rangePreset}
                onChange={(_, v: RangePreset | null) => v && setRangePreset(v)}
                sx={rangeToggleSx('#1e88e5')}
              >
                <ToggleButton value="7d">7D</ToggleButton>
                <ToggleButton value="30d">30D</ToggleButton>
                <ToggleButton value="90d">90D</ToggleButton>
                <ToggleButton value="custom">Custom</ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {rangePreset === 'custom' && (
              <>
                <DatePicker
                  label="Start"
                  value={customStart}
                  onChange={(v) => setCustomStart(v)}
                  slotProps={{ textField: { size: 'small', sx: { width: 160, backgroundColor: 'white', borderRadius: 1.5 } } }}
                />
                <DatePicker
                  label="End"
                  value={customEnd}
                  onChange={(v) => setCustomEnd(v)}
                  slotProps={{ textField: { size: 'small', sx: { width: 160, backgroundColor: 'white', borderRadius: 1.5 } } }}
                />
              </>
            )}

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TuneRounded sx={{ fontSize: 18, color: 'text.disabled' }} />
              <FormControl size="small" sx={{ minWidth: 220 }}>
                <InputLabel id="compare-measurement-label">Measurement</InputLabel>
                <Select
                  labelId="compare-measurement-label"
                  label="Measurement"
                  value={measurement}
                  onChange={(e: SelectChangeEvent) => setMeasurement(e.target.value as Measurement)}
                  sx={{ backgroundColor: 'white', borderRadius: 1.5 }}
                >
                  {MEASUREMENTS.map((m) => (
                    <MenuItem key={m.key} value={m.key} sx={{ display: 'flex', gap: 1 }}>
                      <m.Icon sx={{ fontSize: 17, color: m.color }} />
                      {m.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            {activeMeasurement.usesVolumeUnit && (
              <ToggleButtonGroup
                exclusive
                size="small"
                value={unit}
                onChange={(_, v: VolumeUnit | null) => v && setUnit(v)}
                sx={rangeToggleSx(activeMeasurement.color)}
              >
                <ToggleButton value="L">L</ToggleButton>
                <ToggleButton value="gal">gal</ToggleButton>
                <ToggleButton value="acre-ft">ac-ft</ToggleButton>
              </ToggleButtonGroup>
            )}

          </Box>

          {chartError ? (
            <Alert severity="error">{chartError}</Alert>
          ) : plottedData.length === 0 ? (
            <Box sx={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography variant="body2" sx={{ color: 'text.disabled' }}>
                {chartLoading ? 'Loading…' : 'No data for the selected range'}
              </Typography>
            </Box>
          ) : (
            <Box sx={{ width: '100%', height: { xs: 320, sm: 380, md: 420 }, opacity: chartLoading ? 0.5 : 1, transition: 'opacity 200ms ease' }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={plottedData}
                  margin={{ top: 28, right: 16, left: 8, bottom: plottedData.length > 6 ? 48 : 24 }}
                  barCategoryGap="35%"
                  barGap={4}
                >
                  <defs>
                    <linearGradient id="compareBarGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={activeMeasurement.colorEnd} />
                      <stop offset="100%" stopColor={activeMeasurement.color} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(0,0,0,0.06)" vertical={false} />
                  <XAxis
                    dataKey="displayName"
                    interval={0}
                    angle={plottedData.length > 6 ? -30 : 0}
                    textAnchor={plottedData.length > 6 ? 'end' : 'middle'}
                    height={plottedData.length > 6 ? 56 : 30}
                    tick={{ fontSize: 12, fill: '#666' }}
                    axisLine={{ stroke: '#e0e0e0' }}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="left"
                    // 18% headroom above the tallest bar (or its error-bar top,
                    // whichever is greater) — without it, a bar near the domain
                    // max leaves no room for its value label, which gets clipped
                    // by the chart's own bounding box instead of just crowding
                    // the plot area.
                    domain={[0, (dataMax: number) => dataMax * 1.18]}
                    allowDataOverflow
                    tickFormatter={(v: number) => {
                      // Volume ticks need more decimals in the tiny acre-ft
                      // unit; specific-energy ticks need the opposite — an
                      // acre-foot is ~1.2M liters, so kWh/ac-ft is a large
                      // number where extra decimals just add noise.
                      const maximumFractionDigits =
                        measurement === 'energy' ? (unit === 'acre-ft' ? 0 : 2) : unit === 'acre-ft' ? 4 : 1;
                      return `${v.toLocaleString(undefined, { maximumFractionDigits })} ${yUnitLabel}`;
                    }}
                    tick={{ fontSize: 11, fill: '#888' }}
                    axisLine={false}
                    tickLine={false}
                    width={90}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={(v: number) => `${v.toFixed(0)} g/m³`}
                    tick={{ fontSize: 11, fill: HUMIDITY_COLOR }}
                    axisLine={false}
                    tickLine={false}
                    width={70}
                  />
                  <RechartsTooltip
                    content={<ChartTooltip measurement={measurement} unit={unit} color={activeMeasurement.color} showHumidity />}
                    cursor={{ fill: tint(activeMeasurement.color, 0.06) }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '0.78rem', paddingTop: 8 }}
                    iconType="rect"
                    formatter={(value: string) => <span style={{ color: '#484848' }}>{value}</span>}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="mean"
                    name={activeMeasurement.label}
                    fill="url(#compareBarGradient)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                    animationDuration={500}
                    animationEasing="ease-out"
                    activeBar={{ fill: activeMeasurement.color, stroke: activeMeasurement.colorEnd, strokeWidth: 2 }}
                  >
                    {measurement !== 'total' && (
                      <ErrorBar dataKey="std" width={6} strokeWidth={1.5} stroke="#333" direction="y" />
                    )}
                    <LabelList
                      dataKey="mean"
                      position="top"
                      formatter={(label: React.ReactNode) =>
                        typeof label === 'number' ? formatMeasurementValue(label, measurement, unit) : ''
                      }
                      style={{ fontSize: 10, fill: '#666', fontWeight: 600 }}
                    />
                  </Bar>
                  {measurement !== 'total' && (
                    // The bar (mean) answers "how does this station compare to
                    // the others over the period"; this tick answers "is it
                    // currently at, above, or below its own average right now"
                    // — a station whose tick sits well below its bar top is
                    // underperforming its own recent average, which a bar
                    // showing only the mean would hide.
                    <Scatter
                      yAxisId="left"
                      dataKey="latest"
                      name="Latest hour"
                      legendType="line"
                      fill="#1a1a1a"
                      shape={(props: { cx?: number; cy?: number }) => {
                        const { cx, cy } = props;
                        if (cx == null || cy == null) return <g />;
                        return (
                          <line
                            x1={cx - 14}
                            x2={cx + 14}
                            y1={cy}
                            y2={cy}
                            stroke="#1a1a1a"
                            strokeWidth={3}
                            strokeLinecap="round"
                          />
                        );
                      }}
                    />
                  )}
                  <Bar
                    yAxisId="right"
                    dataKey="absHumidity"
                    name="Absolute humidity (intake)"
                    fill={HUMIDITY_COLOR}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                    animationDuration={500}
                    animationEasing="ease-out"
                    activeBar={{ fill: HUMIDITY_COLOR, stroke: '#00838f', strokeWidth: 2 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </Box>
          )}

          <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 1 }}>
            Right axis: absolute humidity at intake (g/m³) — independent scale, shown for environmental context only.
            {measurement !== 'total' && ' The black tick on each bar is that station’s latest hour — compare it to the bar (the period average) to see whether a station is currently running above or below its own norm.'}
          </Typography>

          {missingCount > 0 && (
            <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 1.5 }}>
              {missingCount} station{missingCount === 1 ? '' : 's'} excluded — no data in this range.
            </Typography>
          )}
        </Paper>
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }}>
      <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <Box sx={{ px: { xs: 2.5, md: 3.5 }, pt: 2.5 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Water Produced totals the last {WINDOW_DAYS} days · Harvesting Efficiency and Specific Energy Consumption show each station&apos;s latest hour
          </Typography>
        </Box>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ background: 'linear-gradient(90deg, rgba(144,19,64,0.05), rgba(92,107,192,0.05))' }}>
                <TableCell sx={{ fontWeight: 700 }}>Station</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Water Produced ({WINDOW_DAYS}d)</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Harvesting Efficiency (latest)</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Specific Energy Consumption (latest)</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Last Reading</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tableRows.map(({ station, waterProducedL, lastEfficiencyPct, lastSpecificEnergyKWhPerL, hasRecentData }, i) => (
                <React.Fragment key={station.station_name}>
                  {i === firstOfflineIndex && firstOfflineIndex > 0 && (
                    <TableRow>
                      <TableCell colSpan={6} sx={{ py: 1, backgroundColor: 'rgba(0,0,0,0.03)', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.7rem' }}>
                          Offline
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow
                    hover
                    sx={{
                      backgroundColor: i % 2 === 1 ? 'rgba(0,0,0,0.015)' : 'transparent',
                      borderLeft: `3px solid ${station.status === 'active' ? '#2e7d32' : 'transparent'}`,
                      transition: 'background-color 150ms ease',
                    }}
                  >
                  <TableCell>
                    <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>{station.station_name}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {station.location || 'Arizona, USA'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={station.status === 'active' ? 'success' : 'error'}
                      label={station.status === 'active' ? 'Online' : 'Offline'}
                      sx={{
                        backgroundColor: station.status === 'active' ? 'success.light' : 'error.light',
                        color: station.status === 'active' ? 'success.main' : 'error.main',
                        fontWeight: 600,
                      }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    {waterProducedL != null ? (
                      <MetricBar
                        value={waterProducedL}
                        max={maxWater}
                        label={`${waterProducedL.toLocaleString(undefined, { maximumFractionDigits: 2 })} L`}
                        color="#901340"
                      />
                    ) : (
                      <Typography sx={{ color: 'text.disabled', fontSize: '0.85rem' }}>
                        {hasRecentData ? '—' : `No data in ${WINDOW_DAYS}d`}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <MetricBar
                      value={lastEfficiencyPct}
                      max={maxEfficiency}
                      label={lastEfficiencyPct != null ? `${lastEfficiencyPct.toFixed(1)}%` : '—'}
                      color="#ffcb25"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <MetricBar
                      value={lastSpecificEnergyKWhPerL}
                      max={maxSpecificEnergy}
                      label={lastSpecificEnergyKWhPerL != null ? `${lastSpecificEnergyKWhPerL.toFixed(3)} kWh/L` : '—'}
                      color="#5c6bc0"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {station.metadata.last_reading
                        ? formatPhoenixMonthDayTime(new Date(station.metadata.last_reading))
                        : 'Never'}
                    </Typography>
                    {(() => {
                      const fresh = freshnessOf(station.metadata.last_reading);
                      return (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, mt: 0.25 }}>
                          <Box sx={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: fresh.color }} />
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {fresh.label}{fresh.ageSec != null ? ` · ${formatAge(fresh.ageSec)}` : ''}
                          </Typography>
                        </Box>
                      );
                    })()}
                  </TableCell>
                  </TableRow>
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      </motion.div>
    </Box>
  );
}
