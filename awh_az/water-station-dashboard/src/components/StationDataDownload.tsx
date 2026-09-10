'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Chip,
  CircularProgress,
  Snackbar,
  Alert,
} from '@mui/material';
import { CalendarMonth, Download } from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { format } from 'date-fns';
import Papa from 'papaparse';
import { apiClient, type StationInfo } from '@/lib/api-client';
import {
  fieldDisplayNames,
  COMPUTED_FIELDS,
  WEIGHT_NOISE_FLOOR_G,
  ENERGY_SANITY_CEILING_KWH,
  AWH_DUCT_AREA_M2,
  computeAbsHumidity,
  velocityToMps,
} from '@/lib/stationFields';

/**
 * Raw + hourly CSV export for one station, with its own date-range picker.
 * Moved here from the public station page (previously visible to every
 * visitor) so exporting data is an admin-only action — the page itself
 * lives under /admin, which is passphrase-gated by middleware.ts.
 */
export default function StationDataDownload({ station }: { station: StationInfo }) {
  const availableFields = station.metadata.available_fields;
  const stationName = station.station_name;

  const [startDate, setStartDate] = useState<Date | null>(
    station.metadata.last_reading
      ? new Date(new Date(station.metadata.last_reading).getTime() - 7 * 24 * 60 * 60 * 1000)
      : null
  );
  const [endDate, setEndDate] = useState<Date | null>(
    station.metadata.last_reading ? new Date(new Date(station.metadata.last_reading).getTime() + 60 * 60 * 1000) : null
  );

  const allDownloadFields = [...availableFields.filter(f => fieldDisplayNames[f]), ...Array.from(COMPUTED_FIELDS)];
  const [rawDownloadFields, setRawDownloadFields] = useState<string[]>(allDownloadFields);
  const [rawDownloading, setRawDownloading] = useState(false);
  const [hourlyDownloading, setHourlyDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadWarning, setDownloadWarning] = useState<string | null>(null);

  const rangeReady = !!(startDate && endDate);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        <CalendarMonth sx={{ fontSize: 18, color: 'text.disabled' }} />
        <DatePicker
          label="Start"
          value={startDate}
          onChange={(v) => setStartDate(v)}
          slotProps={{ textField: { size: 'small', sx: { width: 160 } } }}
        />
        <DatePicker
          label="End"
          value={endDate}
          onChange={(v) => setEndDate(v)}
          slotProps={{ textField: { size: 'small', sx: { width: 160 } } }}
        />
      </Box>

      {!rangeReady && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Pick a start and end date to enable downloads.
        </Typography>
      )}

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

          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                Select Variables
              </Typography>
              <Button
                size="small"
                onClick={() => {
                  setRawDownloadFields(rawDownloadFields.length === allDownloadFields.length ? [] : allDownloadFields);
                }}
                sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem' }}
              >
                {rawDownloadFields.length === allDownloadFields.length ? 'Deselect All' : 'Select All'}
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
              {allDownloadFields.map(field => (
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
            disabled={!rangeReady || rawDownloadFields.length === 0 || rawDownloading}
            onClick={async () => {
              if (!startDate || !endDate) return;
              setRawDownloading(true);
              try {
                // Base fields needed for computation (always fetch these if any computed field is selected)
                const COMPUTE_DEPS = ['temperature', 'humidity', 'outtake_temperature', 'outtake_humidity', 'weight', 'energy'];
                const selectedRaw = rawDownloadFields.filter(f => !COMPUTED_FIELDS.has(f));
                const needsComputed = rawDownloadFields.some(f => COMPUTED_FIELDS.has(f));
                const fieldsToFetch = needsComputed
                  ? [...new Set([...selectedRaw, ...COMPUTE_DEPS])]
                  : selectedRaw;

                const { data: rawRows, truncated } = await apiClient.getAllStationReadings(
                  stationName,
                  {
                    start_date: startDate.toISOString(),
                    end_date: endDate.toISOString(),
                    fields: fieldsToFetch,
                  },
                  { maxRows: 200000, maxDurationMs: 240000 }
                );
                if (truncated) {
                  setDownloadWarning(
                    'The selected date range had more readings than could be exported at once — the downloaded CSV only covers the earliest part of the range. Pick a narrower date range for the rest.'
                  );
                }

                const sorted = [...rawRows].sort((a, b) =>
                  new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                );

                let accumulatedWaterG = 0;
                let prevWeight: number | null = null;
                let prevEnergy: number | null = null;
                let prevTimestamp: string | null = null;

                const enriched = sorted.map(r => {
                  const row: Record<string, unknown> = { ...r };

                  let absHIn: number | null = null;
                  if (typeof r.temperature === 'number' && typeof r.humidity === 'number') {
                    absHIn = computeAbsHumidity(r.temperature, r.humidity);
                    row.abs_humidity_intake = Math.round(absHIn * 10000) / 10000;
                  }
                  if (typeof r.outtake_temperature === 'number' && typeof r.outtake_humidity === 'number') {
                    row.abs_humidity_outtake = Math.round(computeAbsHumidity(r.outtake_temperature, r.outtake_humidity) * 10000) / 10000;
                  }
                  const w = r.weight as number | null | undefined;
                  let incWG = 0;
                  if (typeof w === 'number') {
                    const weightDelta = prevWeight !== null ? w - prevWeight : 0;
                    incWG = weightDelta >= WEIGHT_NOISE_FLOOR_G ? weightDelta : 0;
                    row.incremental_water_g = incWG;
                    accumulatedWaterG += incWG;
                    row.accumulated_water_L = Math.round(accumulatedWaterG / 1000 * 1000000) / 1000000;
                    prevWeight = w;
                  }
                  const eRaw = r.energy as number | null | undefined;
                  const e = typeof eRaw === 'number' && eRaw <= ENERGY_SANITY_CEILING_KWH ? eRaw : null;
                  if (e !== null) {
                    row.energy = e;
                    row.incremental_energy_kWh = prevEnergy !== null ? Math.round(Math.max(e - prevEnergy, 0) * 1000000) / 1000000 : 0;
                    prevEnergy = e;
                  } else if (typeof eRaw === 'number') {
                    row.energy = null;
                    row.incremental_energy_kWh = null;
                  }
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
                link.download = `${stationName}_raw_${format(startDate, 'yyyyMMdd')}-${format(endDate, 'yyyyMMdd')}.csv`;
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
              '&:hover': { background: 'linear-gradient(135deg, #43a047 0%, #2e7d32 100%)' },
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
            disabled={!rangeReady || hourlyDownloading}
            onClick={async () => {
              if (!startDate || !endDate) return;
              setHourlyDownloading(true);
              try {
                const resp = await apiClient.getHourlyAggregation(stationName, {
                  start_date: startDate.toISOString(),
                  end_date: endDate.toISOString(),
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
                link.download = `${stationName}_hourly_${format(startDate, 'yyyyMMdd')}-${format(endDate, 'yyyyMMdd')}.csv`;
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
              '&:hover': { background: 'linear-gradient(135deg, #7b1038 0%, #5a0d28 100%)' },
            }}
          >
            {hourlyDownloading ? 'Downloading...' : 'Download Hourly CSV'}
          </Button>
        </Paper>
      </Box>

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
