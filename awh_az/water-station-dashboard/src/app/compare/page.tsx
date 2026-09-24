'use client';

import React, { useEffect, useMemo, useState } from 'react';
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
import { useTheme } from '@mui/material/styles';
import {
  WaterDrop,
  Bolt,
  Speed,
  SensorsRounded,
  WifiTethering,
  EmojiEvents,
  CalendarMonth,
  TuneRounded,
  CompareArrows,
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
import type { StationInfo } from '@/lib/api-client';
import { useStations, useHourlyMany, type HourlyRequest } from '@/hooks/queries';
import { formatPhoenixMonthDayTime } from '@/lib/timezone';
import { filterVisibleStations } from '@/lib/hiddenStations';
import { freshnessOf, formatAge } from '@/lib/freshness';
import {
  type Measurement,
  type VolumeUnit,
  type ChartPoint,
  UNIT_LABEL,
  formatMeasurementValue,
  summarizeWindow,
  buildComparisonPoint,
  monthKeyOf,
  formatMonthLabel,
  monthRangeISO,
} from '@/lib/compareMath';

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
      <Box sx={{ height: 6, borderRadius: 3, backgroundColor: 'action.hover', overflow: 'hidden' }}>
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
const DAY_MS = 24 * 60 * 60 * 1000;

// ISO string of a timestamp rounded down to the hour (hourly data has no finer resolution).
function hourFloorISO(ms: number): string {
  return new Date(Math.floor(ms / 3_600_000) * 3_600_000).toISOString();
}

// --- Top panel: configurable bar chart -------------------------------------

type RangePreset = '7d' | '30d' | '90d' | 'all' | 'custom';
// 'same-time' plots every station over the identical calendar window —
// the more rigorous comparison, since it holds external conditions (season,
// weather) roughly constant, but stations that weren't running yet or have
// since gone offline will show no data. 'per-station' instead gives each
// station a window of the same *length* ending at its own last reading, so
// units that were never running concurrently (the lab periodically switches
// and relocates stations) can still be compared. Both are legitimate
// comparisons for different questions, so this is a user choice, not a
// setting one mode supersedes.
type AlignMode = 'same-time' | 'per-station';

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
    backgroundColor: 'background.paper',
    borderRadius: 2,
    '& .MuiToggleButton-root': {
      border: '1px solid',
      borderColor: 'divider',
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

const RANGE_PRESET_DAYS: Record<Exclude<RangePreset, 'custom' | 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 };

// Absolute humidity at intake — the ambient moisture actually available to be
// harvested. Shown as environmental context alongside whichever measurement
// is selected, since water production and energy draw both depend on it. A
// distinct hue outside the four measurement colors, since it's a different
// kind of variable (a condition, not a harvest metric).
const HUMIDITY_COLOR = '#00acc1';

function formatHumidity(value: number): string {
  return `${value.toFixed(1)} g/m³`;
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
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  if (point.mean == null) return null;
  return (
    <Box
      sx={{
        backgroundColor: isDark ? 'rgba(30,30,30,0.98)' : 'rgba(255,255,255,0.98)',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '12px',
        boxShadow: isDark ? '0 12px 32px rgba(0,0,0,0.5)' : '0 12px 32px rgba(0,0,0,0.16)',
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
          <Box sx={{ width: 14, height: 2, backgroundColor: 'text.primary', flexShrink: 0 }} />
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
        border: '1px solid',
        borderColor: 'divider',
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

// Estimate, not a confirmed team decision yet — revisit once settled.
type CompareMode = 'stations' | 'months';

export default function ComparePage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  // Recharts takes literal color strings, not MUI theme tokens, so the
  // chart chrome (grid, axes, tooltip, latest-hour marker) needs its own
  // light/dark pair computed here instead of adapting automatically.
  const chartGridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const chartAxisLineColor = isDark ? 'rgba(255,255,255,0.2)' : '#e0e0e0';
  const chartTickColor = isDark ? '#aaa' : '#666';
  const chartTickColorMuted = '#888';
  const chartMarkerColor = isDark ? '#f0f0f0' : '#1a1a1a';
  const chartLegendColor = isDark ? theme.palette.text.secondary : '#484848';
  // "Now" for this page visit, fixed so every preset window and query key is stable.
  const [nowMs] = useState(() => Date.now());
  const stationsQuery = useStations();
  const stations = useMemo(
    () => filterVisibleStations(stationsQuery.data ?? []),
    [stationsQuery.data]
  );

  // Top panel controls
  const [rangePreset, setRangePreset] = useState<RangePreset>('7d');
  const [alignMode, setAlignMode] = useState<AlignMode>('same-time');
  const [customStart, setCustomStart] = useState<Date | null>(null);
  const [customEnd, setCustomEnd] = useState<Date | null>(null);
  const [measurement, setMeasurement] = useState<Measurement>('total');
  const [unit, setUnit] = useState<VolumeUnit>('L');

  // "Compare months" mode: same chart, but the bars are different calendar
  // months of ONE station instead of different stations.
  const [compareMode, setCompareMode] = useState<CompareMode>('stations');
  // Defaults to the first station once the list loads, so switching to
  // "Compare months" always has a station already selected.
  const [monthStationChoice, setMonthStationChoice] = useState<string>('');
  const monthStationName = monthStationChoice || stations[0]?.station_name || '';
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]); // 'yyyy-MM' keys
  const [monthPickerValue, setMonthPickerValue] = useState<Date | null>(null);
  function addMonth(date: Date | null) {
    if (!date) return;
    const key = monthKeyOf(date);
    setSelectedMonths((prev) => (prev.includes(key) ? prev : [...prev, key].sort()));
    setMonthPickerValue(null);
  }

  function removeMonth(key: string) {
    setSelectedMonths((prev) => prev.filter((m) => m !== key));
  }

  // Bottom table: a fixed trailing window per station. The start is rounded
  // down to the hour so the query key is stable and revisits hit the cache.
  const tableWindowStartISO = hourFloorISO(nowMs - WINDOW_DAYS * DAY_MS);
  const tableQuery = useHourlyMany(
    stations.map((s) => ({ key: s.station_name, stationName: s.station_name, start: tableWindowStartISO })),
    stations.length > 0
  );

  const tableRows: StationComparison[] = useMemo(() => {
    const results = stations.map((station): StationComparison => {
      const rows = tableQuery.byKey[station.station_name] ?? [];
      const summary = summarizeWindow(rows);
      return {
        station,
        waterProducedL: summary.waterProducedL,
        lastEfficiencyPct: summary.lastEfficiencyPct,
        lastSpecificEnergyKWhPerL: summary.lastSpecificEnergyKWhPerL,
        hasRecentData: rows.length > 0,
      };
    });
    // Online stations first (stable partition), then by water produced
    // within each group — so an active station never gets buried below
    // a wall of offline ones just because it produced less this window.
    results.sort((a, b) => {
      const aOnline = a.station.status === 'active';
      const bOnline = b.station.status === 'active';
      if (aOnline !== bOnline) return aOnline ? -1 : 1;
      return (b.waterProducedL ?? -1) - (a.waterProducedL ?? -1);
    });
    return results;
  }, [stations, tableQuery.byKey]);

  const loading = stationsQuery.isLoading || (stations.length > 0 && tableQuery.isLoading);
  const error = stationsQuery.error ? stationsQuery.error.message : tableQuery.error;

  // After 6s of the page-level skeleton, explain why it's slow.
  const [slowLoad, setSlowLoad] = useState(false);
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setSlowLoad(true), 6000);
    return () => {
      clearTimeout(t);
      setSlowLoad(false);
    };
  }, [loading]);

  // rangeDurationDays: the window length in days (used by 'per-station'
  // mode, and to derive the same-time absolute bounds for the preset
  // buttons). null means "no filter" — true for the 'all' preset, and also
  // the "not ready yet" state for an unset custom picker (rangeReady
  // disambiguates the two).
  // rangeStartISO/rangeEndISO: the literal absolute bounds used by
  // 'same-time' mode — computed for every preset (not just custom) so
  // switching modes on 7D/30D/90D works without extra state.
  const { rangeDurationDays, rangeStartISO, rangeEndISO, rangeLabel, rangeReady } = useMemo(() => {
    if (rangePreset === 'custom') {
      if (!customStart || !customEnd) {
        return { rangeDurationDays: null, rangeStartISO: null, rangeEndISO: null, rangeLabel: 'Pick a custom range', rangeReady: false };
      }
      const days = Math.max(1, Math.round((customEnd.getTime() - customStart.getTime()) / (24 * 60 * 60 * 1000)));
      const label =
        alignMode === 'same-time'
          ? `${format(customStart, 'MMM d, yyyy')} – ${format(customEnd, 'MMM d, yyyy')} · same dates for every station`
          : `${days}-day window · each station's most recent ${days} days of data`;
      return { rangeDurationDays: days, rangeStartISO: customStart.toISOString(), rangeEndISO: customEnd.toISOString(), rangeLabel: label, rangeReady: true };
    }
    if (rangePreset === 'all') {
      // No start/end filter at all — each station's full history, so a
      // station that's been idle for the last 90 days still shows its
      // real lifetime numbers instead of "no data in range". Same-time vs.
      // per-station is moot here — both mean "everything ever recorded".
      return { rangeDurationDays: null, rangeStartISO: null, rangeEndISO: null, rangeLabel: 'All time', rangeReady: true };
    }
    const days = RANGE_PRESET_DAYS[rangePreset];
    // Rounded down to the hour so re-selecting a preset reuses the cached query.
    const endISO = hourFloorISO(nowMs);
    const startISO = hourFloorISO(nowMs - days * DAY_MS);
    const label =
      alignMode === 'same-time' ? `Last ${days} days · same dates for every station` : `Last ${days} days · each station's most recent data`;
    return { rangeDurationDays: days, rangeStartISO: startISO, rangeEndISO: endISO, rangeLabel: label, rangeReady: true };
  }, [rangePreset, customStart, customEnd, alignMode, nowMs]);

  // One hourly query per station for the chart, keyed on that station's own
  // window. Independent of the bottom table's fixed WINDOW_DAYS fetch — that
  // table always uses today's date for every station, which neither mode
  // here does exactly.
  const chartRequests: HourlyRequest[] = useMemo(() => {
    const reqs: HourlyRequest[] = [];
    for (const station of stations) {
      if (alignMode === 'same-time') {
        // Identical bounds for every station — the rigorous apples-to-apples
        // comparison, at the cost of showing nothing for a station that
        // wasn't running in this window.
        reqs.push({
          key: station.station_name,
          stationName: station.station_name,
          start: rangeStartISO ?? undefined,
          end: rangeEndISO ?? undefined,
        });
      } else if (rangeDurationDays != null) {
        const lastReading = station.metadata.last_reading;
        // Never reported anything — no data point to anchor a trailing
        // window to, regardless of duration.
        if (!lastReading) continue;
        const end = new Date(lastReading);
        reqs.push({
          key: station.station_name,
          stationName: station.station_name,
          start: new Date(end.getTime() - rangeDurationDays * DAY_MS).toISOString(),
          end: end.toISOString(),
        });
      } else {
        reqs.push({ key: station.station_name, stationName: station.station_name });
      }
    }
    return reqs;
  }, [stations, alignMode, rangeDurationDays, rangeStartISO, rangeEndISO]);
  const chartQuery = useHourlyMany(chartRequests, compareMode === 'stations' && rangeReady && stations.length > 0);
  const chartHourly = chartQuery.byKey;
  const chartLoading = chartQuery.isFetching;
  const chartError = chartQuery.error;

  // "Compare months": one hourly query per selected month of the chosen station.
  const monthRequests: HourlyRequest[] = useMemo(
    () =>
      selectedMonths.map((key) => {
        const { start, end } = monthRangeISO(key);
        return { key, stationName: monthStationName, start, end };
      }),
    [selectedMonths, monthStationName]
  );
  const monthlyQuery = useHourlyMany(monthRequests, compareMode === 'months' && !!monthStationName);
  const monthlyHourly = monthlyQuery.byKey;
  const monthlyLoading = monthlyQuery.isFetching;
  const monthlyError = monthlyQuery.error;

  const activeMeasurement = MEASUREMENTS.find((m) => m.key === measurement)!;

  // One point per station, same window — see buildComparisonPoint above.
  const chartData: ChartPoint[] = useMemo(
    () =>
      stations.map((station) => {
        const displayName = station.display_name || station.station_name.replace(/^station_/, '');
        const rows = chartHourly[station.station_name] || [];
        return buildComparisonPoint(station.station_name, displayName, rows, measurement, unit);
      }),
    [stations, chartHourly, measurement, unit]
  );

  // One point per selected month, same station — the "compare months" mode.
  const monthChartData: ChartPoint[] = useMemo(
    () =>
      selectedMonths.map((key) => {
        const rows = monthlyHourly[key] || [];
        return buildComparisonPoint(key, formatMonthLabel(key), rows, measurement, unit);
      }),
    [selectedMonths, monthlyHourly, measurement, unit]
  );

  const activeChartData = compareMode === 'months' ? monthChartData : chartData;
  const plottedData = activeChartData.filter((d) => d.hasData);
  const missingCount = activeChartData.length - plottedData.length;
  const yUnitLabel = measurement === 'energy' ? `kWh/${UNIT_LABEL[unit]}` : measurement === 'efficiency' ? '%' : UNIT_LABEL[unit];
  const activeChartLoading = compareMode === 'months' ? monthlyLoading : chartLoading;
  const activeChartError = compareMode === 'months' ? monthlyError : chartError;

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
        <Skeleton variant="text" width={280} height={48} sx={{ maxWidth: '100%', mx: 'auto', mb: 1 }} />
        <Skeleton variant="text" width={460} height={28} sx={{ maxWidth: '100%', mx: 'auto', mb: slowLoad ? 1 : 5 }} />
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
        <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', p: 2 }}>
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
            background: (t) => t.palette.mode === 'dark' ? 'linear-gradient(90deg, #e5484d, #9fa8da)' : 'linear-gradient(90deg, #901340, #5c6bc0)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          {compareMode === 'months' ? 'Compare Months' : 'Compare Stations'}
        </Typography>
        <Typography variant="body1" sx={{ color: 'text.secondary', mb: 3, textAlign: 'center' }}>
          {compareMode === 'months'
            ? "Water produced, harvesting efficiency, and specific energy consumption across a single station's months"
            : 'Water produced, harvesting efficiency, and specific energy consumption across every station'}
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={compareMode}
            onChange={(_, v: CompareMode | null) => v && setCompareMode(v)}
            sx={rangeToggleSx('#901340')}
          >
            <ToggleButton value="stations">
              <CompareArrows sx={{ fontSize: 16, mr: 0.75 }} />
              Stations
            </ToggleButton>
            <ToggleButton value="months">
              <CalendarMonth sx={{ fontSize: 16, mr: 0.75 }} />
              Months
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </motion.div>

      {compareMode === 'stations' && tableRows.length > 0 && (
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
            border: '1px solid',
            borderColor: 'divider',
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
            {compareMode === 'months'
              ? `${activeMeasurement.label} · ${selectedMonths.length} month${selectedMonths.length === 1 ? '' : 's'} selected · ${
                  stations.find((s) => s.station_name === monthStationName)?.display_name ||
                  monthStationName.replace(/^station_/, '') ||
                  'pick a station'
                }`
              : `${activeMeasurement.label} · ${rangeLabel} · by station`}
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
              backgroundColor: 'action.hover',
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            {compareMode === 'stations' ? (
              <>
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
                    <ToggleButton value="all">All</ToggleButton>
                    <ToggleButton value="custom">Custom</ToggleButton>
                  </ToggleButtonGroup>
                </Box>

                {rangePreset !== 'all' && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CompareArrows sx={{ fontSize: 18, color: 'text.disabled' }} />
                    <ToggleButtonGroup
                      exclusive
                      size="small"
                      value={alignMode}
                      onChange={(_, v: AlignMode | null) => v && setAlignMode(v)}
                      sx={rangeToggleSx('#5c6bc0')}
                    >
                      <ToggleButton value="same-time">Same dates</ToggleButton>
                      <ToggleButton value="per-station">Per-station</ToggleButton>
                    </ToggleButtonGroup>
                  </Box>
                )}

                {rangePreset === 'custom' && (
                  <>
                    <DatePicker
                      label="Start"
                      value={customStart}
                      onChange={(v) => setCustomStart(v)}
                      slotProps={{ textField: { size: 'small', sx: { width: 160, backgroundColor: 'background.paper', borderRadius: 1.5 } } }}
                    />
                    <DatePicker
                      label="End"
                      value={customEnd}
                      onChange={(v) => setCustomEnd(v)}
                      slotProps={{ textField: { size: 'small', sx: { width: 160, backgroundColor: 'background.paper', borderRadius: 1.5 } } }}
                    />
                    <Typography variant="caption" sx={{ color: 'text.disabled', maxWidth: 220 }}>
                      {alignMode === 'same-time'
                        ? 'Exact calendar dates, applied to every station.'
                        : 'Sets a window length (End − Start), applied to each station ending at its own last reading.'}
                    </Typography>
                  </>
                )}
              </>
            ) : (
              <>
                <FormControl size="small" sx={{ minWidth: 220 }}>
                  <InputLabel id="compare-month-station-label">Station</InputLabel>
                  <Select
                    labelId="compare-month-station-label"
                    label="Station"
                    value={monthStationName}
                    onChange={(e: SelectChangeEvent) => setMonthStationChoice(e.target.value)}
                    sx={{ backgroundColor: 'background.paper', borderRadius: 1.5 }}
                  >
                    {stations.map((s) => (
                      <MenuItem key={s.station_name} value={s.station_name}>
                        {s.display_name || s.station_name.replace(/^station_/, '')}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <DatePicker
                  label="Add a month"
                  views={['year', 'month']}
                  openTo="month"
                  value={monthPickerValue}
                  onChange={(v) => addMonth(v)}
                  slotProps={{ textField: { size: 'small', sx: { width: 160, backgroundColor: 'background.paper', borderRadius: 1.5 } } }}
                />

                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {selectedMonths.length === 0 ? (
                    <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                      No months selected yet
                    </Typography>
                  ) : (
                    selectedMonths.map((key) => (
                      <Chip
                        key={key}
                        label={formatMonthLabel(key)}
                        size="small"
                        onDelete={() => removeMonth(key)}
                        sx={{ fontWeight: 600, backgroundColor: 'background.paper', border: '1px solid', borderColor: 'divider' }}
                      />
                    ))
                  )}
                </Box>
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
                  sx={{ backgroundColor: 'background.paper', borderRadius: 1.5 }}
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

          {activeChartError ? (
            <Alert severity="error">{activeChartError}</Alert>
          ) : compareMode === 'months' && selectedMonths.length === 0 ? (
            <Box sx={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography variant="body2" sx={{ color: 'text.disabled' }}>
                Add a month above to get started
              </Typography>
            </Box>
          ) : plottedData.length === 0 ? (
            <Box sx={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography variant="body2" sx={{ color: 'text.disabled' }}>
                {activeChartLoading ? 'Loading…' : 'No data for the selected range'}
              </Typography>
            </Box>
          ) : (
            <Box sx={{ width: '100%', height: { xs: 320, sm: 380, md: 420 }, opacity: activeChartLoading ? 0.5 : 1, transition: 'opacity 200ms ease' }}>
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
                  <CartesianGrid stroke={chartGridColor} vertical={false} />
                  <XAxis
                    dataKey="displayName"
                    interval={0}
                    angle={plottedData.length > 6 ? -30 : 0}
                    textAnchor={plottedData.length > 6 ? 'end' : 'middle'}
                    height={plottedData.length > 6 ? 56 : 30}
                    tick={{ fontSize: 12, fill: chartTickColor }}
                    axisLine={{ stroke: chartAxisLineColor }}
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
                    tick={{ fontSize: 11, fill: chartTickColorMuted }}
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
                    formatter={(value: string) => <span style={{ color: chartLegendColor }}>{value}</span>}
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
                      <ErrorBar dataKey="std" width={6} strokeWidth={1.5} stroke={chartMarkerColor} direction="y" />
                    )}
                    <LabelList
                      dataKey="mean"
                      position="top"
                      formatter={(label: React.ReactNode) =>
                        typeof label === 'number' ? formatMeasurementValue(label, measurement, unit) : ''
                      }
                      style={{ fontSize: 10, fill: chartTickColor, fontWeight: 600 }}
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
                      fill={chartMarkerColor}
                      shape={(props: { cx?: number; cy?: number }) => {
                        const { cx, cy } = props;
                        if (cx == null || cy == null) return <g />;
                        return (
                          <line
                            x1={cx - 14}
                            x2={cx + 14}
                            y1={cy}
                            y2={cy}
                            stroke={chartMarkerColor}
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
            {measurement !== 'total' &&
              ` The black tick on each bar is that ${compareMode === 'months' ? 'month' : 'station'}’s latest hour — compare it to the bar (the period average) to see whether it's currently running above or below its own norm.`}
            {compareMode === 'stations' && rangePreset !== 'all' && alignMode === 'per-station' && ' Each bar covers that station’s own most recent window — stations that started reporting at different times, or have since gone offline, still compare fairly rather than one being excluded for having no data in a shared calendar range.'}
            {compareMode === 'stations' && rangePreset !== 'all' && alignMode === 'same-time' && ' Every bar covers the identical calendar window, so a station that wasn’t running yet (or has since gone offline) may show no data below — switch to “Per-station” to compare it using its own most recent window instead.'}
          </Typography>

          {missingCount > 0 && (
            <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 1.5 }}>
              {missingCount} {compareMode === 'months' ? 'month' : 'station'}
              {missingCount === 1 ? '' : 's'} excluded —{' '}
              {compareMode === 'months'
                ? 'no data in that month.'
                : alignMode === 'same-time'
                ? 'no data in this shared date range.'
                : 'never reported any data.'}
            </Typography>
          )}
        </Paper>
        </motion.div>
      )}

      {compareMode === 'stations' && (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }}>
      <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
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
                      <TableCell colSpan={6} sx={{ py: 1, backgroundColor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider' }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.7rem' }}>
                          Offline
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow
                    hover
                    sx={{
                      backgroundColor: i % 2 === 1 ? 'action.hover' : 'transparent',
                      borderLeft: `3px solid ${station.status === 'active' ? '#2e7d32' : 'transparent'}`,
                      transition: 'background-color 150ms ease',
                    }}
                  >
                  <TableCell>
                    <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>{station.display_name || station.station_name}</Typography>
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
      )}
    </Box>
  );
}
