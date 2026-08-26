'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Typography,
  Box,
  Paper,
  Chip,
  Button,
  CircularProgress,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Menu,
  ListItemText,
  Checkbox,
  FormGroup,
  FormControlLabel
} from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { ArrowBack, Circle as CircleIcon, CalendarMonth, Tune, Download } from '@mui/icons-material';
import { format } from 'date-fns';
import FeaturePlot from '@/components/FeaturePlot';
import Papa from 'papaparse';
import { apiClient, type StationInfo, type StationReading, type ReadingsResponse, type HourlyAggregationResponse, type HourlyDataRow } from '@/lib/api-client';
import { formatPhoenixMonthDayTime } from '@/lib/timezone';
import { getStationImage } from '@/lib/stationImages';
import { FeatureType, ChartDataPoint, StationData } from '@/types';

// Magnus formula helper for absolute humidity (g/m³)
function computeAbsHumidity(tempC: number, rhPct: number): number {
  const es = 6.112 * Math.exp((17.67 * tempC) / (tempC + 243.5));
  return (216.7 * (rhPct / 100) * es) / (273.15 + tempC);
}

// Normalize anemometer velocity to m/s before using it in physical formulas.
function velocityToMps(velocity: number, unit?: string | null): number {
  const u = (unit || '').toLowerCase();
  if (u === 'km/h') return velocity / 3.6;
  if (u === 'mph') return velocity / 2.23694;
  if (u === 'ft/s') return velocity / 3.28084;
  if (u === 'ft/m') return velocity / 196.850394;
  return velocity; // default and 'm/s'
}

// Field mapping: API field names to display names
const fieldDisplayNames: Record<string, string> = {
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
const fieldUnits: Record<string, string> = {
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
const COMPUTED_FIELDS = new Set([
  'abs_humidity_intake',
  'abs_humidity_outtake',
  'accumulated_water_L',
  'incremental_water_g',
  'incremental_energy_kWh',
  'harvesting_efficiency',
]);

// AWH device duct cross-sectional area (m²) — from hardware spec (273.60 sq in = 0.18 m²)
const AWH_DUCT_AREA_M2 = 0.18;

// Field categories for grouping
const fieldCategories: Record<string, string> = {
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

export default function StationDetails() {
  const params = useParams();
  const router = useRouter();
  const stationName = decodeURIComponent(params.id as string);
  
  // API data states
  const [station, setStation] = useState<StationInfo | null>(null);
  const [readings, setReadings] = useState<StationReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableFields, setAvailableFields] = useState<string[]>([]);
  
  // State for mounted check
  const [mounted, setMounted] = useState(false);

  // Start with no selection so buttons show "Select ..." placeholders
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<string>('');
  const [selectedParameters, setSelectedParameters] = useState<string[]>([]);

  // Dialog states
  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const [paramDialogOpen, setParamDialogOpen] = useState(false);

  // Download states
  const [rawDownloadFields, setRawDownloadFields] = useState<string[]>([]);
  const [rawDownloading, setRawDownloading] = useState(false);
  const [hourlyDownloading, setHourlyDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadWarning, setDownloadWarning] = useState<string | null>(null);
  const [rangeTruncated, setRangeTruncated] = useState(false);
  const [readingsLoadedSoFar, setReadingsLoadedSoFar] = useState(0);
  const [hourlyEfficiencyLoading, setHourlyEfficiencyLoading] = useState(false);
  const [hourlyEfficiencyData, setHourlyEfficiencyData] = useState<ChartDataPoint[]>([]);
  const [hourlyRows, setHourlyRows] = useState<HourlyDataRow[]>([]);

  // Loading state for date-range re-fetch
  const [readingsLoading, setReadingsLoading] = useState(false);

  // Live status: most recent reading, polled independently of the date-range chart data
  const [liveReading, setLiveReading] = useState<StationReading | null>(null);
  const [liveReadingError, setLiveReadingError] = useState<string | null>(null);
  const [liveNowTick, setLiveNowTick] = useState(Date.now());

  // Temporary states for dialogs
  const [tempStartDate, setTempStartDate] = useState<Date | null>(null);
  const [tempEndDate, setTempEndDate] = useState<Date | null>(null);
  const [tempUnit, setTempUnit] = useState<string>('');
  const [tempParameters, setTempParameters] = useState<string[]>([]);

  // Fetch station data and readings
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        
        // Fetch station metadata and initial readings in parallel
        const [stations, readingsResponse] = await Promise.all([
          apiClient.getStations(),
          apiClient.getStationReadings(stationName, { limit: 1000 }),
        ]);
        const foundStation = stations.find(s => s.station_name === stationName);
        
        if (!foundStation) {
          setError('Station not found');
          return;
        }
        
        setStation(foundStation);
        setAvailableFields(foundStation.metadata.available_fields);
        // Pre-select all fields for raw download (Firestore fields + computed fields)
        const computedFieldList = Array.from(COMPUTED_FIELDS);
        setRawDownloadFields([
          ...foundStation.metadata.available_fields.filter(f => fieldDisplayNames[f]),
          ...computedFieldList,
        ]);
        
        setReadings(readingsResponse.data);
        
        // Auto-set date range from actual data
        if (readingsResponse.data.length > 0) {
          const timestamps = readingsResponse.data.map(r => new Date(r.timestamp).getTime());
          const maxTime = Math.max(...timestamps);
          const autoEnd = new Date(maxTime + 60 * 60 * 1000); // 1hr buffer
          const autoStart = new Date(maxTime - 7 * 24 * 60 * 60 * 1000); // 7 days before latest
          setStartDate(autoStart);
          setEndDate(autoEnd);
          setTempStartDate(autoStart);
          setTempEndDate(autoEnd);
          
          // Auto-select first available parameter
          const fields = foundStation.metadata.available_fields;
          for (const field of fields) {
            if (fieldCategories[field] && fieldDisplayNames[field]) {
              setSelectedParameters([field]);
              setTempParameters([field]);
              setSelectedUnit(foundStation.unit || '');
              setTempUnit(foundStation.unit || '');
              break;
            }
          }
        }
        
        setError(null);
      } catch (err) {
        console.error('Failed to fetch station data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load station data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [stationName]);

  // Handle mounting
  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Poll the single most recent reading every 30s — independent of the date-range
  // chart data — so a field engineer can watch it advance and confirm the station
  // is actively uploading, matching the station's own cloud-upload cadence.
  useEffect(() => {
    let cancelled = false;

    async function fetchLiveReading() {
      try {
        const resp = await apiClient.getStationReadings(stationName, { limit: 1 });
        if (cancelled) return;
        if (resp.data.length > 0) {
          setLiveReading(resp.data[0]);
          setLiveReadingError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setLiveReadingError(err instanceof Error ? err.message : 'Failed to load live reading');
        }
      }
    }

    fetchLiveReading();
    const intervalId = setInterval(fetchLiveReading, 30000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [stationName]);

  // Ticks the "X ago" freshness label between polls
  useEffect(() => {
    const tickId = setInterval(() => setLiveNowTick(Date.now()), 5000);
    return () => clearInterval(tickId);
  }, []);
  
  // Handle date period apply - re-fetch from API with new date range
  const handleDateApply = async () => {
    setDateDialogOpen(false);
    
    if (!tempStartDate || !tempEndDate) return;

    // Show spinner; keep old chart visible until new data arrives
    setReadingsLoading(true);
    setReadingsLoadedSoFar(0);
    try {
      const { data, truncated } = await apiClient.getAllStationReadings(
        stationName,
        {
          start_date: tempStartDate.toISOString(),
          end_date: tempEndDate.toISOString(),
        },
        { onProgress: setReadingsLoadedSoFar }
      );
      // Update dates and data together so the chart never shows mismatched "0 readings"
      setReadings(data);
      setStartDate(tempStartDate);
      setEndDate(tempEndDate);
      setRangeTruncated(truncated);
    } catch (err) {
      console.error('Failed to fetch readings for date range:', err);
      setDownloadError(
        err instanceof Error
          ? `Couldn't load readings for that date range: ${err.message}`
          : "Couldn't load readings for that date range. Please try again."
      );
    } finally {
      setReadingsLoading(false);
    }
  };
  
  // Handle parameters apply
  const handleParamApply = () => {
    setSelectedUnit(tempUnit);
    setSelectedParameters(tempParameters);
    setParamDialogOpen(false);
  };

  // Handle parameter selection (multiple) — no longer restricted to one category,
  // so a chart can pair e.g. energy with humidity.
  const handleParameterToggle = (parameter: string) => {
    setTempParameters(prev => {
      if (prev.includes(parameter)) {
        return prev.filter(p => p !== parameter);
      } else if (prev.length < 2) {
        return [...prev, parameter];
      }
      return prev;
    });
  };

  // Category label for display purposes only — derived from whatever parameters
  // are actually selected, since selection itself is no longer category-scoped.
  const categoryLabelForParams = (params: string[]): string =>
    Array.from(new Set(params.map(p => fieldCategories[p]).filter((c): c is string => Boolean(c)))).join(' + ');

  // Get available parameters grouped by category
  const parameterCategories = useMemo(() => {
    const categories: Record<string, string[]> = {};

    availableFields.forEach(field => {
      // Exclude raw weight from chart selector — replaced by cumulative water production
      if (field === 'weight') return;
      const category = fieldCategories[field];
      const displayName = fieldDisplayNames[field];
      if (category && displayName) {
        if (!categories[category]) categories[category] = [];
        categories[category].push(field);
      }
    });

    // Add computed abs humidity fields (derived from base readings)
    if (availableFields.includes('temperature') && availableFields.includes('humidity')) {
      if (!categories['Air Conditions']) categories['Air Conditions'] = [];
      if (!categories['Air Conditions'].includes('abs_humidity_intake'))
        categories['Air Conditions'].push('abs_humidity_intake');
    }
    if (availableFields.includes('outtake_temperature') && availableFields.includes('outtake_humidity')) {
      if (!categories['Air Conditions']) categories['Air Conditions'] = [];
      if (!categories['Air Conditions'].includes('abs_humidity_outtake'))
        categories['Air Conditions'].push('abs_humidity_outtake');
    }

    // Replace raw weight (g) with cumulative water production (L) in chart selector
    if (availableFields.includes('weight')) {
      if (!categories['Water Production']) categories['Water Production'] = [];
      if (!categories['Water Production'].includes('accumulated_water_L'))
        categories['Water Production'].push('accumulated_water_L');
    }

    // Add harvesting efficiency when intake humidity + velocity are available
    if (availableFields.includes('temperature') && availableFields.includes('humidity') && availableFields.includes('velocity') && availableFields.includes('weight')) {
      if (!categories['Efficiency']) categories['Efficiency'] = [];
      if (!categories['Efficiency'].includes('harvesting_efficiency'))
        categories['Efficiency'].push('harvesting_efficiency');
    }

    return categories;
  }, [availableFields]);

  // One independent data series per selected parameter — rendered as separate graphs
  // rather than overlaid on shared axes, so each parameter reads at its own scale.
  const chartDataByParam: { field: string; data: ChartDataPoint[] }[] = useMemo(() => {
    if (!startDate || !endDate || selectedParameters.length === 0 || readings.length === 0) return [];
    
    // Filter readings by date range
    const start = startDate.getTime();
    const end = endDate.getTime();
    
    const filteredReadings = readings.filter(reading => {
      const readingDate = new Date(reading.timestamp).getTime();
      return readingDate >= start && readingDate <= end;
    });
    
    // Sort ascending by timestamp (API returns descending)
    filteredReadings.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Pre-compute cumulative water production (L) for accumulated_water_L field
    const accWaterMap = new Map<string, number>();
    let runningWaterG = 0;
    let prevW: number | null = null;
    filteredReadings.forEach(r => {
      const w = typeof r.weight === 'number' ? r.weight : null;
      if (w !== null) {
        runningWaterG += prevW !== null ? Math.max(w - prevW, 0) : 0;
        prevW = w;
      }
      accWaterMap.set(r.timestamp, Math.round(runningWaterG / 1000 * 1000000) / 1000000);
    });

    // Pre-compute incremental energy (kWh) per reading
    const incEnergyMap = new Map<string, number>();
    let prevE: number | null = null;
    filteredReadings.forEach(r => {
      const e = typeof r.energy === 'number' ? r.energy : null;
      if (e !== null) {
        incEnergyMap.set(r.timestamp, prevE !== null ? Math.max(e - prevE, 0) / 1000 : 0);
        prevE = e;
      } else {
        incEnergyMap.set(r.timestamp, 0);
      }
    });

    // Pre-compute incremental water (g) per reading for harvesting efficiency
    const incWaterMap = new Map<string, number>();
    let prevWeff: number | null = null;
    filteredReadings.forEach(r => {
      const w = typeof r.weight === 'number' ? r.weight : null;
      if (w !== null) {
        incWaterMap.set(r.timestamp, prevWeff !== null ? Math.max(w - prevWeff, 0) : 0);
        prevWeff = w;
      } else {
        incWaterMap.set(r.timestamp, 0);
      }
    });

    // Pre-compute harvesting efficiency (%) per reading
    // Formula: (incremental_water_g/1000) / (abs_humidity × velocity_mps × DUCT_AREA × Δt_s / 1000) × 100
    // = incremental_water_g / (abs_humidity × velocity_mps × DUCT_AREA × Δt_s) × 100
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

    // Helper: resolve a field value, computing derived fields on the fly if needed
    const resolveValue = (reading: StationReading, field: string): number => {
      if (field === 'abs_humidity_intake') {
        const t = reading.temperature, h = reading.humidity;
        return typeof t === 'number' && typeof h === 'number' ? computeAbsHumidity(t, h) : 0;
      }
      if (field === 'abs_humidity_outtake') {
        const t = reading.outtake_temperature, h = reading.outtake_humidity;
        return typeof t === 'number' && typeof h === 'number' ? computeAbsHumidity(t, h) : 0;
      }
      if (field === 'accumulated_water_L') {
        return accWaterMap.get(reading.timestamp) ?? 0;
      }
      if (field === 'incremental_water_g') {
        return incWaterMap.get(reading.timestamp) ?? 0;
      }
      if (field === 'incremental_energy_kWh') {
        return incEnergyMap.get(reading.timestamp) ?? 0;
      }
      if (field === 'harvesting_efficiency') {
        return effMap.get(reading.timestamp) ?? 0;
      }
      if (field === 'energy') {
        return typeof reading.energy === 'number' ? reading.energy / 1000 : 0;
      }
      const v = reading[field as keyof StationReading];
      return typeof v === 'number' ? v : 0;
    };

    return selectedParameters.map(field => ({
      field,
      data: filteredReadings.map(reading => ({
        date: reading.timestamp,
        value: resolveValue(reading, field),
      })),
    }));
  }, [startDate, endDate, selectedParameters, readings]);
  
  const filteredData = useMemo(() => {
    if (!startDate || !endDate || readings.length === 0) return [];
    
    const start = startDate.getTime();
    const end = endDate.getTime();
    
    return readings.filter(reading => {
      const readingDate = new Date(reading.timestamp).getTime();
      return readingDate >= start && readingDate <= end;
    });
  }, [startDate, endDate, readings]);

  // Fetch hourly harvesting efficiency series for charting
  useEffect(() => {
    let cancelled = false;

    async function fetchHourlyEfficiency() {
      if (!startDate || !endDate) {
        setHourlyEfficiencyData([]);
        setHourlyRows([]);
        return;
      }

      setHourlyEfficiencyLoading(true);
      try {
        const resp = await apiClient.getHourlyAggregation(stationName, {
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
        });

        if (cancelled) return;

        const points: ChartDataPoint[] = (resp.data || [])
          .filter(r => typeof r.harvesting_efficiency_pct_hourly === 'number')
          .map(r => ({
            date: r.hour,
            value: r.harvesting_efficiency_pct_hourly ?? 0,
          }));

        setHourlyEfficiencyData(points);
        setHourlyRows(resp.data || []);
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to fetch hourly harvesting efficiency:', err);
          setHourlyEfficiencyData([]);
          setHourlyRows([]);
        }
      } finally {
        if (!cancelled) setHourlyEfficiencyLoading(false);
      }
    }

    fetchHourlyEfficiency();

    return () => {
      cancelled = true;
    };
  }, [stationName, startDate, endDate]);
  
  const handleBack = () => {
    router.push('/');
  };
  
  const getStatusColor = (status: string) => {
    return status === 'active' ? 'success' : 'error';
  };
  
  const getStatusIconColor = (status: string) => {
    return status === 'active' ? '#4caf50' : '#f44336';
  };
  
  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
        <CircularProgress size={60} sx={{ color: '#901340' }} />
      </Box>
    );
  }

  if (error || !station) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <Alert severity="error">{error || 'Station not found'}</Alert>
      </Box>
    );
  }
  
  // Don't render until mounted to avoid hydration mismatch
  if (!mounted) {
    return null;
  }
  
  const dateRangeString = startDate && endDate
    ? `${format(startDate, 'MMM dd, yyyy')} - ${format(endDate, 'MMM dd, yyyy')}`
    : '';

  // Freshness of the live reading — cloud upload cadence is ~60s, so anything
  // past a couple minutes signals the station has actually stopped sending.
  const liveAgeSec = liveReading
    ? Math.max(0, Math.floor((liveNowTick - new Date(liveReading.timestamp).getTime()) / 1000))
    : null;
  const liveAgeLabel = liveAgeSec === null
    ? null
    : liveAgeSec < 60
      ? `${liveAgeSec}s ago`
      : liveAgeSec < 3600
        ? `${Math.floor(liveAgeSec / 60)}m ago`
        : `${Math.floor(liveAgeSec / 3600)}h ago`;
  const liveStatus: 'fresh' | 'stale' | 'dead' | 'unknown' =
    liveAgeSec === null ? 'unknown' : liveAgeSec < 120 ? 'fresh' : liveAgeSec < 600 ? 'stale' : 'dead';
  const liveStatusColor = { fresh: '#4caf50', stale: '#ff9800', dead: '#f44336', unknown: '#9e9e9e' }[liveStatus];
  const liveStatusText = { fresh: 'Live', stale: 'Delayed', dead: 'Not sending', unknown: 'Waiting for data' }[liveStatus];

  // Totals for the selected date period — summed from the hourly aggregation rather than
  // averaging per-hour ratios, so a mostly-idle period doesn't skew the energy/liter figure.
  const periodTotalWaterL = hourlyRows.reduce((sum, r) => sum + (r.water_produced_L ?? 0), 0);
  const periodTotalEnergyKWh = hourlyRows.reduce((sum, r) => sum + (r.energy_consumed_kWh ?? 0), 0);
  const periodEnergyPerLiter = periodTotalWaterL > 0 ? periodTotalEnergyKWh / periodTotalWaterL : null;

  // Most recent hour's water production rate — for Live Status, distinct from the
  // period total above.
  const latestHourlyRow = hourlyRows.length > 0 ? hourlyRows[hourlyRows.length - 1] : null;

  // Hourly chart series — one point per hour, still rendered as a connected line/area
  // like the harvesting efficiency chart below.
  const hourlyEnergyPerLiterData: ChartDataPoint[] = hourlyRows
    .filter(r => typeof r.energy_per_liter_kWh_L === 'number')
    .map(r => ({ date: r.hour, value: r.energy_per_liter_kWh_L as number }));
  const hourlyWaterProductionData: ChartDataPoint[] = hourlyRows
    .filter(r => typeof r.water_produced_L === 'number')
    .map(r => ({ date: r.hour, value: r.water_produced_L as number }));
  
  return (
    <Box sx={{ px: { xs: 2, sm: 3, md: 4 }, py: 4, maxWidth: '1600px', mx: 'auto' }}>
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 3 }}>
          <Button 
            startIcon={<ArrowBack />} 
            onClick={handleBack}
            sx={{ 
              color: 'primary.main',
              fontWeight: 600,
              '&:hover': {
                backgroundColor: 'rgba(30, 136, 229, 0.08)'
              }
            }}
          >
            Back to Stations
          </Button>


        </Box>
      </motion.div>
      
      {/* Station Header with Photo */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <Paper 
          elevation={0} 
          sx={{ 
            p: { xs: 3, md: 4 }, 
            mb: 4,
            background: 'linear-gradient(135deg, #1e88e5 0%, #1565c0 100%)',
            color: 'white',
            borderRadius: 3,
            position: 'relative',
            overflow: 'hidden',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'radial-gradient(circle at top right, rgba(255,255,255,0.1) 0%, transparent 60%)',
              pointerEvents: 'none',
            }
          }}
        >
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 4, alignItems: 'center' }}>
          {/* Station Image */}
          <Box
            component="img"
            src={getStationImage(station.station_name)}
            alt={station.station_name}
            sx={{
              width: { xs: '100%', md: '450px' },
              height: { xs: '250px', md: '320px' },
              objectFit: 'cover',
              borderRadius: 3,
              boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            }}
          />
          
          {/* Station Info */}
          <Box sx={{ flex: 1 }}>
            <Box display="flex" alignItems="center" gap={2} mb={2} flexWrap="wrap">
              <Typography 
                variant="h3" 
                component="h1"
                sx={{ 
                  fontWeight: 700,
                  fontSize: { xs: '1.75rem', sm: '2.25rem', md: '2.75rem' }
                }}
              >
                {station.station_name}
              </Typography>
              <Chip
                icon={<CircleIcon sx={{ fontSize: 16 }} />}
                label={station.status.charAt(0).toUpperCase() + station.status.slice(1)}
                color={getStatusColor(station.status)}
                sx={{ 
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  px: 1.5,
                  py: 2.5,
                  backgroundColor: 'white',
                  color: station.status === 'active' ? '#4caf50' : '#f44336',
                }}
              />
            </Box>
            
            <Typography variant="h6" sx={{ mb: 3, opacity: 0.95, fontSize: { xs: '1rem', md: '1.15rem' } }}>
              📍 {station.location || 'ASU Campus'}
            </Typography>
            
            <Typography variant="body1" paragraph sx={{ lineHeight: 1.8, mb: 3, opacity: 0.9 }}>
              This state-of-the-art atmospheric water harvesting station represents the cutting edge of sustainable water technology. 
              Utilizing advanced condensation and filtration systems, it extracts clean, potable water directly from the ambient air.
            </Typography>
            
            <Box sx={{ 
              display: 'grid', 
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, 
              gap: 2,
              backgroundColor: 'rgba(255, 255, 255, 0.15)',
              borderRadius: 2,
              p: 2.5,
              backdropFilter: 'blur(10px)',
            }}>
              <Box>
                <Typography variant="body2" sx={{ opacity: 0.8 }}>Total Readings</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>{station.metadata.total_readings}</Typography>
              </Box>
              <Box>
                <Typography variant="body2" sx={{ opacity: 0.8 }}>Available Fields</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>{station.metadata.available_fields.length}</Typography>
              </Box>
              <Box>
                <Typography variant="body2" sx={{ opacity: 0.8 }}>Last Updated</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  {station.metadata.last_reading ? formatPhoenixMonthDayTime(new Date(station.metadata.last_reading)) : 'N/A'}
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>
      </Paper>
      </motion.div>

      {/* Live Status — most recent raw reading, polled every 30s */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
      >
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2.5, md: 3 },
            mb: 4,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 3,
            background: 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.06)',
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#1e88e5', fontSize: '1.15rem' }}>
              Live Status
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: liveStatusColor,
                  animation: liveStatus === 'fresh' ? 'pulse 2s infinite' : 'none',
                  '@keyframes pulse': {
                    '0%, 100%': { opacity: 1 },
                    '50%': { opacity: 0.4 },
                  },
                }}
              />
              <Typography variant="body2" sx={{ fontWeight: 600, color: liveStatusColor }}>
                {liveStatusText}
              </Typography>
              {liveAgeLabel && (
                <Typography variant="caption" color="text.secondary">
                  · last reading {liveAgeLabel}
                </Typography>
              )}
            </Box>
          </Box>

          {startDate && endDate && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
              Humidity and power are instant readings; water production is the most recent hour&apos;s rate; total water produced and energy consumption are totals for {dateRangeString}.
            </Typography>
          )}

          {liveReadingError && !liveReading && (
            <Alert severity="warning" sx={{ borderRadius: 2 }}>
              Couldn&apos;t load a live reading: {liveReadingError}
            </Alert>
          )}

          {liveReading && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(auto-fit, minmax(140px, 1fr))' }, gap: 2 }}>
              {[
                { key: 'water_total', label: 'Total Water Produced', value: hourlyRows.length > 0 ? periodTotalWaterL : null, unit: 'L', decimals: 2, requires: ['weight'] },
                { key: 'water_per_hour', label: 'Water Production', value: latestHourlyRow?.water_produced_L ?? null, unit: 'L/h', decimals: 2, requires: ['weight'] },
                { key: 'humidity', label: 'Intake Humidity', value: liveReading.humidity, unit: '%', decimals: 1, requires: ['humidity'] },
                { key: 'outtake_humidity', label: 'Outtake Humidity', value: liveReading.outtake_humidity, unit: '%', decimals: 1, requires: ['outtake_humidity'] },
                { key: 'energy_per_liter', label: 'Energy Consumption', value: periodEnergyPerLiter, unit: 'kWh/L', decimals: 3, requires: ['energy', 'weight'] },
                { key: 'power', label: 'Power', value: liveReading.power, unit: 'W', decimals: 1, requires: ['power'] },
              ]
                .filter(f => f.requires.every(r => availableFields.includes(r)) && typeof f.value === 'number')
                .map(f => (
                  <Box
                    key={f.key}
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      backgroundColor: 'rgba(248, 249, 250, 0.7)',
                      border: '1px solid rgba(222, 226, 230, 0.6)',
                    }}
                  >
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                      {f.label.toUpperCase()}
                    </Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#1565c0' }}>
                      {(f.value as number).toFixed(f.decimals)} {f.unit}
                    </Typography>
                  </Box>
                ))}
            </Box>
          )}

          {!liveReading && !liveReadingError && (
            <Typography variant="body2" color="text.secondary">
              Loading live reading…
            </Typography>
          )}
        </Paper>
      </motion.div>

      {/* Data Analytics Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <Paper 
          elevation={0} 
          sx={{ 
            p: { xs: 2.5, md: 4 }, 
            mb: 3,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 3,
            background: 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.06)',
          }}
        >
        <Typography 
          variant="h4" 
          gutterBottom 
          sx={{ 
            fontWeight: 700,
            color: '#1e88e5',
            mb: 4,
            fontSize: { xs: '1.5rem', md: '2rem' }
          }}
        >
          📊 Performance Analytics
        </Typography>
        
        {/* Filter Controls */}
        <Box sx={{ 
          background: 'rgba(248, 249, 250, 0.7)',
          backdropFilter: 'blur(10px)',
          borderRadius: 3,
          p: 4,
          mb: 4,
          border: '1px solid rgba(222, 226, 230, 0.6)',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.04)',
        }}>
          <Typography 
            variant="h6" 
            gutterBottom 
            sx={{ 
              fontSize: '1.25rem', 
              fontWeight: 700,
              color: '#1e88e5',
              mb: 3,
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}
          >
            <Box sx={{ 
              backgroundColor: '#1e88e5',
              borderRadius: '50%',
              p: 0.75,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Tune sx={{ fontSize: '1.25rem', color: 'white' }} />
            </Box>
            Configure Data View
          </Typography>
          
          <Box 
            sx={{
              display: 'flex',
              gap: 3,
              flexWrap: 'wrap',
            }}
          >
            {/* Date Period Button */}
            {/* Date Period Button */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{ flex: 1, minWidth: '280px' }}
            >
              <Button
                variant="contained"
                size="large"
                fullWidth
                startIcon={<CalendarMonth sx={{ fontSize: '1.5rem' }} />}
                onClick={() => {
                  setTempStartDate(startDate);
                  setTempEndDate(endDate);
                  setDateDialogOpen(true);
                }}
                sx={{
                  px: 4,
                  py: 2,
                  background: 'rgba(255, 255, 255, 0.9)',
                  backdropFilter: 'blur(10px)',
                  border: '2px solid #1e88e5',
                  color: '#1e88e5',
                  fontWeight: 600,
                  textTransform: 'none',
                  fontSize: '1.05rem',
                  borderRadius: 2.5,
                  boxShadow: '0 4px 12px rgba(30, 136, 229, 0.15)',
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #1e88e5 0%, #1565c0 100%)',
                    color: 'white',
                    boxShadow: '0 6px 20px rgba(30, 136, 229, 0.3)',
                    border: '2px solid #1565c0',
                  }
                }}
              >
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1 }}>
                  <Typography variant="caption" sx={{ fontSize: '0.7rem', opacity: 0.8, fontWeight: 500 }}>
                    DATE PERIOD
                  </Typography>
                <Typography sx={{ fontWeight: 600, fontSize: '0.95rem' }}>
                  {startDate && endDate 
                    ? `${format(startDate, 'MMM dd')} - ${format(endDate, 'MMM dd, yyyy')}`
                    : 'Select Date Period'}
                </Typography>
                </Box>
              </Button>
            </motion.div>

            {/* Parameters Button */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{ flex: 1, minWidth: '320px' }}
            >
              <Button
                variant="contained"
                size="large"
                fullWidth
                startIcon={<Tune sx={{ fontSize: '1.5rem' }} />}
                onClick={() => {
                  setTempUnit(selectedUnit);
                  setTempParameters(selectedParameters);
                  setParamDialogOpen(true);
                }}
                sx={{
                  px: 4,
                  py: 2,
                  background: 'rgba(255, 255, 255, 0.9)',
                  backdropFilter: 'blur(10px)',
                  border: '2px solid #1e88e5',
                  color: '#1e88e5',
                  fontWeight: 600,
                  textTransform: 'none',
                  fontSize: '1.05rem',
                  borderRadius: 2.5,
                  boxShadow: '0 4px 12px rgba(30, 136, 229, 0.15)',
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #1e88e5 0%, #1565c0 100%)',
                    color: 'white',
                    boxShadow: '0 6px 20px rgba(30, 136, 229, 0.3)',
                    border: '2px solid #1565c0',
                  }
                }}
              >
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1 }}>
                  <Typography variant="caption" sx={{ fontSize: '0.7rem', opacity: 0.8, fontWeight: 500 }}>
                    PARAMETERS
                  </Typography>
                <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', textAlign: 'left' }}>
                  {selectedParameters.length > 0
                    ? `${categoryLabelForParams(selectedParameters)} • ${selectedParameters.map(p => fieldDisplayNames[p] || p).join(' & ')}`
                    : 'Select Parameters'}
                </Typography>
                </Box>
              </Button>
            </motion.div>
          </Box>
        </Box>
      </Paper>
      </motion.div>
      
      {readingsLoading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: 320, justifyContent: 'center', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <CircularProgress size={36} />
            <Typography color="text.secondary">
              {readingsLoadedSoFar > 0
                ? `Loading readings… ${readingsLoadedSoFar.toLocaleString()} so far`
                : 'Loading readings…'}
            </Typography>
          </Box>
          {readingsLoadedSoFar >= 10000 && (
            <Typography variant="caption" color="text.secondary">
              This is a busy date range — it can take a few minutes to load in full.
            </Typography>
          )}
        </Box>
      )}

      {!readingsLoading && rangeTruncated && (
        <Alert severity="warning" sx={{ mt: 2, borderRadius: 2 }}>
          The selected date range has more readings than could be loaded at once — showing only
          the earliest part of the range. Pick a narrower date range to see the rest.
        </Alert>
      )}

      {!readingsLoading && startDate && endDate && chartDataByParam.map(({ field, data }, i) => (
        <motion.div
          key={field}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 + i * 0.05 }}
        >
          <FeaturePlot
            data={data}
            feature={`${fieldCategories[field] || ''} - ${fieldDisplayNames[field] || field}` as FeatureType}
            startDate={format(startDate, 'yyyy-MM-dd')}
            endDate={format(endDate, 'yyyy-MM-dd')}
            paramNames={[fieldDisplayNames[field] || field]}
            paramUnits={[fieldUnits[field] || '']}
          />
        </motion.div>
      ))}

      {!readingsLoading && startDate && endDate && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
        >
          {hourlyEfficiencyLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 280, gap: 2 }}>
              <CircularProgress size={32} />
              <Typography color="text.secondary">Loading hourly harvesting efficiency…</Typography>
            </Box>
          ) : (
            <FeaturePlot
              data={hourlyEfficiencyData}
              feature={'Efficiency - Harvesting Efficiency (Hourly)' as FeatureType}
              startDate={format(startDate, 'yyyy-MM-dd')}
              endDate={format(endDate, 'yyyy-MM-dd')}
              paramNames={['Harvesting Efficiency (Hourly)']}
              paramUnits={['%']}
            />
          )}
        </motion.div>
      )}

      {!readingsLoading && startDate && endDate && !hourlyEfficiencyLoading && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <FeaturePlot
            data={hourlyEnergyPerLiterData}
            feature={'Efficiency - Specific Energy Consumption (Hourly)' as FeatureType}
            startDate={format(startDate, 'yyyy-MM-dd')}
            endDate={format(endDate, 'yyyy-MM-dd')}
            paramNames={['Specific Energy Consumption (Hourly)']}
            paramUnits={['kWh/L']}
          />
        </motion.div>
      )}

      {!readingsLoading && startDate && endDate && !hourlyEfficiencyLoading && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.45 }}
        >
          <FeaturePlot
            data={hourlyWaterProductionData}
            feature={'Water Production - Water Production Rate (Hourly)' as FeatureType}
            startDate={format(startDate, 'yyyy-MM-dd')}
            endDate={format(endDate, 'yyyy-MM-dd')}
            paramNames={['Water Production Rate (Hourly)']}
            paramUnits={['L/h']}
          />
        </motion.div>
      )}

      {/* Data Download Section */}
      {startDate && endDate && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <Paper 
            elevation={0} 
            sx={{ 
              p: { xs: 2.5, md: 4 }, 
              mt: 3,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 3,
              background: 'rgba(255, 255, 255, 0.8)',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.06)',
            }}
          >
            <Typography 
              variant="h4" 
              gutterBottom 
              sx={{ 
                fontWeight: 700,
                color: '#1e88e5',
                mb: 4,
                fontSize: { xs: '1.5rem', md: '2rem' }
              }}
            >
              📥 Data Download
            </Typography>
            
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 3 }}>
              {/* Raw Data Download */}
              <Paper
                elevation={0}
                sx={{
                  flex: 1,
                  p: 3,
                  border: '2px solid #e3f2fd',
                  borderRadius: 2,
                  '&:hover': { borderColor: '#1e88e5' },
                  transition: 'border-color 0.3s',
                }}
              >
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#1565c0', mb: 1 }}>
                  Raw Data
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Download all raw sensor readings for the selected date range. One row per reading (~1/min). Select which variables to include.
                </Typography>
                
                {/* Variable selection for raw download */}
                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                      Select Variables
                    </Typography>
                    <Button 
                      size="small" 
                      onClick={() => {
                        const allFields = [
                          ...availableFields.filter(f => fieldDisplayNames[f]),
                          ...Array.from(COMPUTED_FIELDS),
                        ];
                        if (rawDownloadFields.length === allFields.length) {
                          setRawDownloadFields([]);
                        } else {
                          setRawDownloadFields(allFields);
                        }
                      }}
                      sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem' }}
                    >
                      {rawDownloadFields.length === [...availableFields.filter(f => fieldDisplayNames[f]), ...Array.from(COMPUTED_FIELDS)].length ? 'Deselect All' : 'Select All'}
                    </Button>
                  </Box>
                  <Box sx={{ 
                    display: 'flex', 
                    flexWrap: 'wrap', 
                    gap: 0.75,
                    maxHeight: '160px',
                    overflowY: 'auto',
                    p: 1,
                    backgroundColor: '#f8f9fa',
                    borderRadius: 1.5,
                  }}>
                    {[...availableFields.filter(f => fieldDisplayNames[f]), ...Array.from(COMPUTED_FIELDS)].map(field => (
                      <Chip
                        key={field}
                        label={fieldDisplayNames[field]}
                        size="small"
                        onClick={() => {
                          setRawDownloadFields(prev => 
                            prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]
                          );
                        }}
                        sx={{
                          fontWeight: rawDownloadFields.includes(field) ? 600 : 400,
                          backgroundColor: rawDownloadFields.includes(field) ? '#1e88e5' : 'white',
                          color: rawDownloadFields.includes(field) ? 'white' : 'text.primary',
                          border: '1px solid',
                          borderColor: rawDownloadFields.includes(field) ? '#1e88e5' : '#ddd',
                          cursor: 'pointer',
                          '&:hover': { 
                            backgroundColor: rawDownloadFields.includes(field) ? '#1565c0' : '#e3f2fd',
                          },
                        }}
                      />
                    ))}
                  </Box>
                </Box>

                <Button
                  variant="contained"
                  fullWidth
                  startIcon={rawDownloading ? <CircularProgress size={18} color="inherit" /> : <Download />}
                  disabled={rawDownloadFields.length === 0 || rawDownloading}
                  onClick={async () => {
                    setRawDownloading(true);
                    try {
                      // Base fields needed for computation (always fetch these if any computed field is selected)
                      const COMPUTE_DEPS = ['temperature', 'humidity', 'outtake_temperature', 'outtake_humidity', 'weight', 'energy'];
                      const selectedRaw = rawDownloadFields.filter(f => !COMPUTED_FIELDS.has(f));
                      const needsComputed = rawDownloadFields.some(f => COMPUTED_FIELDS.has(f));
                      // Fetch all base fields + dependencies (no server-side filter when computed fields selected)
                      const fieldsToFetch = needsComputed
                        ? [...new Set([...selectedRaw, ...COMPUTE_DEPS])]
                        : selectedRaw;

                      const { data: rawRows, truncated } = await apiClient.getAllStationReadings(
                        stationName,
                        {
                          start_date: startDate!.toISOString(),
                          end_date: endDate!.toISOString(),
                          fields: fieldsToFetch,
                        },
                        { maxRows: 200000, maxDurationMs: 240000 }
                      );
                      if (truncated) {
                        setDownloadWarning(
                          'The selected date range had more readings than could be exported at once — the downloaded CSV only covers the earliest part of the range. Pick a narrower date range for the rest.'
                        );
                      }

                      // Sort ascending for temporal computations
                      const sorted = [...rawRows].sort((a, b) =>
                        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                      );

                      // Helper: Magnus formula for absolute humidity (g/m³)
                      const absHumidity = (tempC: number, rhPct: number) => {
                        const es = 6.112 * Math.exp((17.67 * tempC) / (tempC + 243.5));
                        return Math.round((216.7 * (rhPct / 100.0) * es) / (273.15 + tempC) * 10000) / 10000;
                      };

                      // Compute derived fields row-by-row
                      let accumulatedWaterG = 0;
                      let prevWeight: number | null = null;
                      let prevEnergy: number | null = null;
                      let prevTimestamp: string | null = null;

                      const enriched = sorted.map(r => {
                        const row: Record<string, unknown> = { ...r };

                        // Absolute humidity (intake)
                        let absHIn: number | null = null;
                        if (typeof r.temperature === 'number' && typeof r.humidity === 'number') {
                          absHIn = absHumidity(r.temperature, r.humidity);
                          row.abs_humidity_intake = absHIn;
                        }
                        // Absolute humidity (outtake)
                        if (typeof r.outtake_temperature === 'number' && typeof r.outtake_humidity === 'number') {
                          row.abs_humidity_outtake = absHumidity(r.outtake_temperature, r.outtake_humidity);
                        }
                        // Incremental water (only positive deltas — never subtract)
                        const w = r.weight as number | null | undefined;
                        let incWG = 0;
                        if (typeof w === 'number') {
                          incWG = prevWeight !== null ? Math.max(w - prevWeight, 0) : 0;
                          row.incremental_water_g = incWG;
                          accumulatedWaterG += incWG;
                          row.accumulated_water_L = Math.round(accumulatedWaterG / 1000 * 1000000) / 1000000;
                          prevWeight = w;
                        }
                        // Incremental energy (only positive deltas)
                        const e = r.energy as number | null | undefined;
                        if (typeof e === 'number') {
                          row.energy = Math.round(e / 1000 * 1000000) / 1000000; // convert Wh → kWh
                          row.incremental_energy_kWh = prevEnergy !== null ? Math.round(Math.max(e - prevEnergy, 0) / 1000 * 1000000) / 1000000 : 0;
                          prevEnergy = e;
                        }
                        // Harvesting efficiency
                        const vel = r.velocity as number | null | undefined;
                        if (absHIn !== null && typeof vel === 'number' && absHIn > 0 && vel > 0) {
                          const dtMs = prevTimestamp ? new Date(r.timestamp).getTime() - new Date(prevTimestamp).getTime() : 30000;
                          const dtS = Math.min(dtMs / 1000, 120);
                          const velMps = velocityToMps(vel, r.unit);
                          const intakeG = absHIn * velMps * AWH_DUCT_AREA_M2 * dtS;
                          row.harvesting_efficiency = intakeG > 0
                            ? Math.round(Math.min((incWG / intakeG) * 100, 100) * 10000) / 10000
                            : 0;
                        } else {
                          row.harvesting_efficiency = 0;
                        }
                        prevTimestamp = r.timestamp;

                        return row;
                      });

                      // Build CSV with user-selected columns only
                      const exportData = enriched.map(r => {
                        const csvRow: Record<string, unknown> = {
                          station_name: r.station_name,
                          timestamp: r.timestamp,
                        };
                        rawDownloadFields.forEach(f => {
                          csvRow[fieldDisplayNames[f] || f] = r[f];
                        });
                        return csvRow;
                      });
                      const csv = Papa.unparse(exportData);
                      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                      const link = document.createElement('a');
                      link.href = URL.createObjectURL(blob);
                      link.download = `${station.station_name}_raw_${format(startDate!, 'yyyyMMdd')}-${format(endDate!, 'yyyyMMdd')}.csv`;
                      link.click();
                    } catch (err) {
                      console.error('Raw download failed:', err);
                      setDownloadError(
                        err instanceof Error
                          ? `Raw data download failed: ${err.message}`
                          : 'Raw data download failed. Please try again or narrow the date range.'
                      );
                    } finally {
                      setRawDownloading(false);
                    }
                  }}
                  sx={{
                    background: 'linear-gradient(135deg, #4caf50 0%, #388e3c 100%)',
                    fontWeight: 600,
                    py: 1.5,
                    borderRadius: 2,
                    textTransform: 'none',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #43a047 0%, #2e7d32 100%)',
                    }
                  }}
                >
                  {rawDownloading ? 'Downloading...' : `Download Raw CSV (${rawDownloadFields.length} variables)`}
                </Button>
              </Paper>

              {/* Hourly Aggregated Data Download */}
              <Paper
                elevation={0}
                sx={{
                  flex: 1,
                  p: 3,
                  border: '2px solid #fce4ec',
                  borderRadius: 2,
                  '&:hover': { borderColor: '#901340' },
                  transition: 'border-color 0.3s',
                }}
              >
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#901340', mb: 1 }}>
                  Hourly Aggregated Data
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Hourly mean &amp; standard deviation for all sensor parameters, plus calculated fields: energy consumption (kWh/L), water production per hour, absolute humidity.
                </Typography>
                
                <Box sx={{ mb: 2, p: 2, backgroundColor: '#f8f9fa', borderRadius: 1.5 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1 }}>
                    Includes per hour:
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {[
                      'Temperature (mean/std)',
                      'Humidity (mean/std)',
                      'Velocity (mean/std)',
                      'Outtake Temp (mean/std)',
                      'Outtake Humidity (mean/std)',
                      'Outtake Velocity (mean/std)',
                      'Power (mean/std)',
                      'Abs Humidity Intake',
                      'Abs Humidity Outtake',
                      'Water Produced (g, L)',
                      'Energy Consumed (kWh)',
                      'Energy/Liter (kWh/L)',
                    ].map(label => (
                      <Chip key={label} label={label} size="small" 
                        sx={{ fontSize: '0.7rem', backgroundColor: '#fce4ec', color: '#901340', fontWeight: 500 }} 
                      />
                    ))}
                  </Box>
                </Box>

                <Button
                  variant="contained"
                  fullWidth
                  startIcon={hourlyDownloading ? <CircularProgress size={18} color="inherit" /> : <Download />}
                  disabled={hourlyDownloading}
                  onClick={async () => {
                    setHourlyDownloading(true);
                    try {
                      const resp = await apiClient.getHourlyAggregation(stationName, {
                        start_date: startDate!.toISOString(),
                        end_date: endDate!.toISOString(),
                      });
                      const exportData = resp.data.map(row => ({
                        'Hour': row.hour,
                        'Reading Count': row.reading_count,
                        'Temperature Mean (°C)': row.temperature_mean,
                        'Temperature Std': row.temperature_std,
                        'Humidity Mean (%)': row.humidity_mean,
                        'Humidity Std': row.humidity_std,
                        'Velocity Mean (m/s)': row.velocity_mean,
                        'Velocity Std': row.velocity_std,
                        'Outtake Temperature Mean (°C)': row.outtake_temperature_mean,
                        'Outtake Temperature Std': row.outtake_temperature_std,
                        'Outtake Humidity Mean (%)': row.outtake_humidity_mean,
                        'Outtake Humidity Std': row.outtake_humidity_std,
                        'Outtake Velocity Mean (m/s)': row.outtake_velocity_mean,
                        'Outtake Velocity Std': row.outtake_velocity_std,
                        'Power Mean (W)': row.power_mean,
                        'Power Std': row.power_std,
                        'Current Mean (A)': row.current_mean,
                        'Current Std': row.current_std,
                        'Voltage Mean (V)': row.voltage_mean,
                        'Voltage Std': row.voltage_std,
                        'Abs Humidity Intake Mean (g/m³)': row.abs_humidity_intake_mean,
                        'Abs Humidity Intake Std': row.abs_humidity_intake_std,
                        'Abs Humidity Outtake Mean (g/m³)': row.abs_humidity_outtake_mean,
                        'Abs Humidity Outtake Std': row.abs_humidity_outtake_std,
                        'Water Produced (g)': row.water_produced_g,
                        'Water Produced (L)': row.water_produced_L,
                        'Intake Available Water (g/hr)': row.intake_available_water_g_hourly,
                        'Captured Water (g/hr)': row.water_captured_g_hourly,
                        'Harvesting Efficiency Hourly (%)': row.harvesting_efficiency_pct_hourly,
                        'Energy Consumed (kWh)': row.energy_consumed_kWh,
                        'Energy per Liter (kWh/L)': row.energy_per_liter_kWh_L,
                      }));
                      const csv = Papa.unparse(exportData);
                      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                      const link = document.createElement('a');
                      link.href = URL.createObjectURL(blob);
                      link.download = `${station.station_name}_hourly_${format(startDate!, 'yyyyMMdd')}-${format(endDate!, 'yyyyMMdd')}.csv`;
                      link.click();
                    } catch (err) {
                      console.error('Hourly download failed:', err);
                      setDownloadError(
                        err instanceof Error
                          ? `Hourly data download failed: ${err.message}`
                          : 'Hourly data download failed. Please try again or narrow the date range.'
                      );
                    } finally {
                      setHourlyDownloading(false);
                    }
                  }}
                  sx={{
                    background: 'linear-gradient(135deg, #901340 0%, #6a0f30 100%)',
                    fontWeight: 600,
                    py: 1.5,
                    borderRadius: 2,
                    textTransform: 'none',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #7b1038 0%, #5a0d28 100%)',
                    }
                  }}
                >
                  {hourlyDownloading ? 'Downloading...' : 'Download Hourly CSV'}
                </Button>
              </Paper>
            </Box>
          </Paper>
        </motion.div>
      )}

      {/* Date Period Dialog */}
      <AnimatePresence>
        {dateDialogOpen && (
          <Dialog 
            open={dateDialogOpen} 
            onClose={() => setDateDialogOpen(false)}
            maxWidth="md"
            fullWidth
            PaperProps={{
              sx: {
                borderRadius: 3,
                boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                background: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(20px)',
              }
            }}
            TransitionProps={{
              timeout: 300,
            }}
          >
        <DialogTitle sx={{ 
          fontWeight: 700, 
          fontSize: '1.75rem',
          background: 'linear-gradient(135deg, #1e88e5 0%, #1565c0 100%)',
          color: 'white',
          py: 3,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5
        }}>
          <Box sx={{ 
            backgroundColor: 'rgba(255,255,255,0.2)',
            borderRadius: '50%',
            p: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <CalendarMonth sx={{ fontSize: '1.75rem' }} />
          </Box>
          Select Date Period
        </DialogTitle>
        <DialogContent sx={{ pt: 5, pb: 4, px: 4 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600, color: 'text.secondary', fontSize: '0.875rem' }}>
                START DATE
              </Typography>
              <DatePicker
                label="Start Date"
                value={tempStartDate}
                onChange={(newValue) => setTempStartDate(newValue)}
                slotProps={{ 
                  textField: { 
                    fullWidth: true,
                    size: 'medium',
                    sx: {
                      '& .MuiOutlinedInput-root': {
                        backgroundColor: '#f8f9fa',
                        borderRadius: 2,
                        '&:hover': {
                          backgroundColor: '#e9ecef'
                        },
                        '&.Mui-focused': {
                          backgroundColor: 'white'
                        }
                      }
                    }
                  } 
                }}
              />
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600, color: 'text.secondary', fontSize: '0.875rem' }}>
                END DATE
              </Typography>
              <DatePicker
                label="End Date"
                value={tempEndDate}
                onChange={(newValue) => setTempEndDate(newValue)}
                slotProps={{ 
                  textField: { 
                    fullWidth: true,
                    size: 'medium',
                    sx: {
                      '& .MuiOutlinedInput-root': {
                        backgroundColor: '#f8f9fa',
                        borderRadius: 2,
                        '&:hover': {
                          backgroundColor: '#e9ecef'
                        },
                        '&.Mui-focused': {
                          backgroundColor: 'white'
                        }
                      }
                    }
                  } 
                }}
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ 
          p: 3, 
          px: 4,
          backgroundColor: '#f8f9fa',
          gap: 2
        }}>
          <Button 
            onClick={() => setDateDialogOpen(false)}
            variant="outlined"
            size="large"
            sx={{ 
              color: 'text.secondary',
              fontWeight: 600,
              px: 4,
              py: 1.5,
              borderRadius: 2,
              textTransform: 'none',
              fontSize: '1rem'
            }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleDateApply}
            variant="contained"
            size="large"
            sx={{ 
              background: 'linear-gradient(135deg, #1e88e5 0%, #1565c0 100%)',
              fontWeight: 600,
              px: 5,
              py: 1.5,
              borderRadius: 2,
              textTransform: 'none',
              fontSize: '1rem',
              boxShadow: '0 4px 12px rgba(30, 136, 229, 0.3)',
              '&:hover': {
                background: 'linear-gradient(135deg, #1565c0 0%, #0d47a1 100%)',
                boxShadow: '0 6px 16px rgba(30, 136, 229, 0.4)',
              }
            }}
          >
            Apply Changes
          </Button>
        </DialogActions>
      </Dialog>
        )}
      </AnimatePresence>

      {/* Parameters Dialog */}
      <AnimatePresence>
        {paramDialogOpen && (
          <Dialog 
            open={paramDialogOpen} 
            onClose={() => setParamDialogOpen(false)}
            maxWidth="md"
            fullWidth
            PaperProps={{
              sx: {
                borderRadius: 3,
                boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                background: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(20px)',
              }
            }}
            TransitionProps={{
              timeout: 300,
            }}
          >
            <DialogTitle sx={{ 
              fontWeight: 700, 
              fontSize: '1.75rem',
              background: 'linear-gradient(135deg, #1e88e5 0%, #1565c0 100%)',
              color: 'white',
          py: 3,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5
        }}>
          <Box sx={{ 
            backgroundColor: 'rgba(255,255,255,0.2)',
            borderRadius: '50%',
            p: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Tune sx={{ fontSize: '1.75rem' }} />
          </Box>
          Configure Parameters
        </DialogTitle>
        <DialogContent sx={{ pt: 5, pb: 4, px: 4 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.875rem' }}>
                SELECT UP TO 2 PARAMETERS — ANY CATEGORY
              </Typography>
              <Chip
                label={`${tempParameters.length}/2 selected`}
                size="small"
                sx={{
                  fontWeight: 600,
                  backgroundColor: tempParameters.length === 2 ? '#4caf50' : '#e3f2fd',
                  color: tempParameters.length === 2 ? 'white' : '#1565c0'
                }}
              />
            </Box>

            {Object.keys(parameterCategories).length > 0 ? (
              <Box sx={{
                backgroundColor: '#f8f9fa',
                borderRadius: 2,
                p: 2.5,
                maxHeight: '420px',
                overflowY: 'auto'
              }}>
                {Object.entries(parameterCategories).map(([category, params]) => (
                  <Box key={category} sx={{ mb: 2.5, '&:last-of-type': { mb: 0 } }}>
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 700, color: '#1565c0', letterSpacing: 0.5, display: 'block', mb: 1 }}
                    >
                      {category.toUpperCase()}
                    </Typography>
                    <FormGroup>
                      {params.map((param) => (
                        <FormControlLabel
                          key={param}
                          control={
                            <Checkbox
                              checked={tempParameters.includes(param)}
                              onChange={() => handleParameterToggle(param)}
                              disabled={!tempParameters.includes(param) && tempParameters.length >= 2}
                              sx={{
                                color: '#1565c0',
                                '&.Mui-checked': {
                                  color: '#1565c0',
                                },
                                '&.Mui-disabled': {
                                  color: '#ccc',
                                }
                              }}
                            />
                          }
                          label={fieldDisplayNames[param] || param}
                          sx={{
                            py: 1,
                            px: 2,
                            borderRadius: 1.5,
                            mb: 1,
                            backgroundColor: tempParameters.includes(param) ? '#e3f2fd' : 'white',
                            border: '1px solid',
                            borderColor: tempParameters.includes(param) ? '#1565c0' : '#e0e0e0',
                            transition: 'all 0.2s',
                            '&:hover': {
                              backgroundColor: tempParameters.includes(param) ? '#bbdefb' : '#f5f5f5',
                              transform: 'translateX(4px)',
                            },
                            '& .MuiFormControlLabel-label': {
                              fontSize: '0.95rem',
                              fontWeight: tempParameters.includes(param) ? 600 : 400,
                              color: tempParameters.includes(param) ? '#1565c0' : 'text.primary',
                            }
                          }}
                        />
                      ))}
                    </FormGroup>
                  </Box>
                ))}
              </Box>
            ) : (
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                No parameters available for this station
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ 
          p: 3,
          px: 4, 
          backgroundColor: '#f8f9fa',
          gap: 2
        }}>
          <Button 
            onClick={() => setParamDialogOpen(false)}
            variant="outlined"
            size="large"
            sx={{ 
              color: 'text.secondary',
              fontWeight: 600,
              px: 4,
              py: 1.5,
              borderRadius: 2,
              textTransform: 'none',
              fontSize: '1rem'
            }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleParamApply}
            variant="contained"
            size="large"
            sx={{ 
              background: 'linear-gradient(135deg, #1e88e5 0%, #1565c0 100%)',
              fontWeight: 600,
              px: 5,
              py: 1.5,
              borderRadius: 2,
              textTransform: 'none',
              fontSize: '1rem',
              boxShadow: '0 4px 12px rgba(30, 136, 229, 0.3)',
              '&:hover': {
                background: 'linear-gradient(135deg, #1565c0 0%, #0d47a1 100%)',
                boxShadow: '0 6px 16px rgba(30, 136, 229, 0.4)',
              }
            }}
          >
            Apply Changes
          </Button>
        </DialogActions>
      </Dialog>
        )}
      </AnimatePresence>

      <Snackbar
        open={!!downloadError}
        autoHideDuration={8000}
        onClose={() => setDownloadError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setDownloadError(null)} severity="error" sx={{ width: '100%' }}>
          {downloadError}
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!downloadWarning}
        autoHideDuration={10000}
        onClose={() => setDownloadWarning(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setDownloadWarning(null)} severity="warning" sx={{ width: '100%' }}>
          {downloadWarning}
        </Alert>
      </Snackbar>
    </Box>
  );
}