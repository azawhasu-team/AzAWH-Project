'use client';

import React, { useEffect, useState } from 'react';
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
  CircularProgress,
  Alert,
} from '@mui/material';
import { apiClient, type StationInfo, type HourlyDataRow } from '@/lib/api-client';
import { formatPhoenixMonthDayTime } from '@/lib/timezone';

interface StationComparison {
  station: StationInfo;
  waterProducedL: number | null;
  efficiencyPct: number | null;
  energyPerLiterKWhL: number | null;
  hasRecentData: boolean;
}

const WINDOW_DAYS = 7;

// Ratio of 7-day totals, not an average of hourly percentages — same
// principle as the backend's hourly efficiency formula (a mean-of-ratios
// would let a handful of noisy near-zero-intake hours skew the result;
// summing captured/available first and dividing once doesn't).
function summarizeHours(rows: HourlyDataRow[]) {
  let waterL = 0;
  let hasWater = false;
  let capturedG = 0;
  let availableG = 0;
  let energyKWh = 0;
  let hasEnergy = false;

  for (const row of rows) {
    if (row.water_produced_L != null) {
      waterL += row.water_produced_L;
      hasWater = true;
    }
    if (row.water_captured_g_hourly != null) capturedG += row.water_captured_g_hourly;
    if (row.intake_available_water_g_hourly != null) availableG += row.intake_available_water_g_hourly;
    if (row.energy_consumed_kWh != null) {
      energyKWh += row.energy_consumed_kWh;
      hasEnergy = true;
    }
  }

  const efficiencyPct = availableG > 0 ? Math.min((capturedG / availableG) * 100, 100) : null;
  const energyPerLiterKWhL = hasEnergy && hasWater && waterL > 0 ? energyKWh / waterL : null;

  return {
    waterProducedL: hasWater ? waterL : null,
    efficiencyPct,
    energyPerLiterKWhL,
  };
}

export default function ComparePage() {
  const [rows, setRows] = useState<StationComparison[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const stations = await apiClient.getStations();
        const startDate = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

        const results = await Promise.all(
          stations.map(async (station): Promise<StationComparison> => {
            try {
              const hourly = await apiClient.getHourlyAggregation(station.station_name, { start_date: startDate });
              const summary = summarizeHours(hourly.data);
              return {
                station,
                waterProducedL: summary.waterProducedL,
                efficiencyPct: summary.efficiencyPct,
                energyPerLiterKWhL: summary.energyPerLiterKWhL,
                hasRecentData: hourly.data.length > 0,
              };
            } catch {
              // 404 (no readings in range) is expected for long-inactive stations —
              // show them as "no data," not as a page-level error.
              return {
                station,
                waterProducedL: null,
                efficiencyPct: null,
                energyPerLiterKWhL: null,
                hasRecentData: false,
              };
            }
          })
        );

        results.sort((a, b) => (b.waterProducedL ?? -1) - (a.waterProducedL ?? -1));
        setRows(results);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load station comparison');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress size={60} sx={{ color: '#901340' }} />
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

  return (
    <Box sx={{ px: { xs: 2, sm: 3, md: 4 }, py: 6, maxWidth: '1200px', mx: 'auto' }}>
      <Typography variant="h4" sx={{ fontWeight: 700, color: '#191919', mb: 1, textAlign: 'center' }}>
        Compare Stations
      </Typography>
      <Typography variant="body1" sx={{ color: '#484848', mb: 5, textAlign: 'center' }}>
        Last {WINDOW_DAYS} days — water produced, harvesting efficiency, and energy cost across every station
      </Typography>

      <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: '#fafafa' }}>
                <TableCell sx={{ fontWeight: 700 }}>Station</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Water Produced</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Harvesting Efficiency</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Energy / Liter</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Last Reading</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(({ station, waterProducedL, efficiencyPct, energyPerLiterKWhL, hasRecentData }) => (
                <TableRow key={station.station_name} hover>
                  <TableCell>
                    <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>{station.station_name}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {station.location || 'Arizona, USA'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={station.status === 'active' ? 'Online' : 'Offline'}
                      sx={{
                        backgroundColor: station.status === 'active' ? '#e8f5e9' : '#ffebee',
                        color: station.status === 'active' ? '#2e7d32' : '#c62828',
                        fontWeight: 600,
                      }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    {waterProducedL != null ? (
                      <Typography sx={{ fontWeight: 700, color: '#901340' }}>
                        {waterProducedL.toLocaleString(undefined, { maximumFractionDigits: 2 })} L
                      </Typography>
                    ) : (
                      <Typography sx={{ color: 'text.disabled' }}>
                        {hasRecentData ? '—' : `No data in ${WINDOW_DAYS}d`}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {efficiencyPct != null ? `${efficiencyPct.toFixed(1)}%` : '—'}
                  </TableCell>
                  <TableCell align="right">
                    {energyPerLiterKWhL != null ? `${energyPerLiterKWhL.toFixed(2)} kWh/L` : '—'}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {station.metadata.last_reading
                        ? formatPhoenixMonthDayTime(new Date(station.metadata.last_reading))
                        : 'Never'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
