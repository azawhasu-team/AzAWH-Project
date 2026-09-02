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
  Skeleton,
  Alert,
} from '@mui/material';
import { apiClient, type StationInfo, type HourlyDataRow } from '@/lib/api-client';
import { formatPhoenixMonthDayTime } from '@/lib/timezone';

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
  efficiencyPct: number | null;
  energyPerLiterKWhL: number | null;
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
      <Box sx={{ px: { xs: 2, sm: 3, md: 4 }, py: 6, maxWidth: '1200px', mx: 'auto' }}>
        <Skeleton variant="text" width={280} height={48} sx={{ mx: 'auto', mb: 1 }} />
        <Skeleton variant="text" width={460} height={28} sx={{ mx: 'auto', mb: 5 }} />
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

  const maxWater = Math.max(0, ...rows.map((r) => r.waterProducedL ?? 0));
  const maxEfficiency = Math.max(0, ...rows.map((r) => r.efficiencyPct ?? 0));
  const maxEnergyPerLiter = Math.max(0, ...rows.map((r) => r.energyPerLiterKWhL ?? 0));

  return (
    <Box sx={{ px: { xs: 2, sm: 3, md: 4 }, py: 6, maxWidth: '1200px', mx: 'auto' }}>
      <Typography variant="h4" sx={{ fontWeight: 700, color: '#191919', mb: 1, textAlign: 'center' }}>
        Compare Stations
      </Typography>
      <Typography variant="body1" sx={{ color: '#484848', mb: 5, textAlign: 'center' }}>
        Last {WINDOW_DAYS} days — water produced, harvesting efficiency, and energy cost across every station
      </Typography>

      {rows.some((r) => r.waterProducedL != null) && (
        <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid rgba(0,0,0,0.08)', p: { xs: 2.5, md: 3.5 }, mb: 4 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '1.05rem', mb: 0.25 }}>
            Water Harvested
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
            Last {WINDOW_DAYS} days, by station
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {rows
              .filter((r) => r.waterProducedL != null)
              .map(({ station, waterProducedL }) => {
                const fresh = freshnessOf(station.metadata.last_reading);
                const pct = maxWater > 0 ? Math.min(((waterProducedL ?? 0) / maxWater) * 100, 100) : 0;
                return (
                  <Box key={station.station_name}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.75 }}>
                      <Box>
                        <Typography sx={{ fontWeight: 600, fontSize: '0.95rem' }}>
                          {station.station_name.replace(/^station_/, '')}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, mt: 0.25 }}>
                          <Box sx={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: fresh.color }} />
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {fresh.label}{fresh.ageSec != null ? ` · ${formatAge(fresh.ageSec)}` : ''}
                          </Typography>
                        </Box>
                      </Box>
                      <Typography sx={{ fontWeight: 700, fontSize: '1.15rem', fontVariantNumeric: 'tabular-nums' }}>
                        {waterProducedL!.toLocaleString(undefined, { maximumFractionDigits: 1 })} L
                      </Typography>
                    </Box>
                    <Box sx={{ height: 10, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                      <Box
                        sx={{
                          height: '100%',
                          width: `${pct}%`,
                          borderRadius: 5,
                          background: 'linear-gradient(90deg, #901340, #b8336a)',
                          transition: 'width 400ms ease',
                        }}
                      />
                    </Box>
                  </Box>
                );
              })}
          </Box>
        </Paper>
      )}

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
                      value={efficiencyPct}
                      max={maxEfficiency}
                      label={efficiencyPct != null ? `${efficiencyPct.toFixed(1)}%` : '—'}
                      color="#ffcb25"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <MetricBar
                      value={energyPerLiterKWhL}
                      max={maxEnergyPerLiter}
                      label={energyPerLiterKWhL != null ? `${energyPerLiterKWhL.toFixed(2)} kWh/L` : '—'}
                      color="#5c6bc0"
                    />
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
