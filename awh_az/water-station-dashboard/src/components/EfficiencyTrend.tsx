'use client';

import React from 'react';
import { Box, Paper, Typography, Skeleton } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useEfficiencyDaily } from '@/hooks/queries';
import type { StationEfficiency } from '@/lib/api-client';
import { efficiencyChartRows, efficiencyChange } from '@/lib/efficiencyTrend';

const COLORS = ['#1e88e5', '#e91e63', '#00897b', '#ef6c00', '#8e24aa', '#6d4c41'];
const DAYS = 30;

/**
 * Energy per litre of water collected (kWh/L), one number per day per station,
 * over the last 30 days. Lower is better: it is the energy the station spends
 * for each litre it pulls out of the air.
 */
export default function EfficiencyTrend() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const grid = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const tick = isDark ? '#aaa' : '#888';
  const axisLine = isDark ? 'rgba(255,255,255,0.2)' : '#e0e0e0';
  const query = useEfficiencyDaily(DAYS);

  if (query.isLoading) return <Skeleton variant="rounded" height={300} sx={{ mb: 4 }} />;
  if (query.isError || !query.data) return null;

  const { stations, warming } = query.data;
  if (stations.length === 0) {
    // Still reading the first time: say so. Otherwise nothing to show, so no empty box.
    return warming ? (
      <Paper elevation={0} sx={{ p: 2.5, mb: 4, border: '1px solid', borderColor: 'divider' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Energy per litre</Typography>
        <Typography variant="body2" color="text.secondary">Calculating from the last {DAYS} days of readings…</Typography>
      </Paper>
    ) : null;
  }

  const rows = efficiencyChartRows(stations);
  const colorOf = (i: number) => COLORS[i % COLORS.length];
  const ariaLabel =
    `Daily energy per litre over the last ${DAYS} days. ` +
    stations
      .map(s => `${s.display_name}: ${s.latest != null ? `${s.latest.toFixed(2)} kWh per litre on ${s.latest_date}` : 'no recent value'}`)
      .join('. ');

  return (
    <Paper elevation={0} sx={{ p: 2.5, mb: 4, border: '1px solid', borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Energy per litre, last {DAYS} days
        </Typography>
        <Typography variant="caption" color="text.secondary">
          kWh used per litre of water collected · lower is better
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mt: 1.5 }}>
        {stations.map((s, i) => (
          <SummaryTile key={s.station_name} station={s} color={colorOf(i)} />
        ))}
      </Box>

      <Box role="img" aria-label={ariaLabel} sx={{ height: 260, mt: 2 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="4 4" stroke={grid} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: tick, fontSize: 11 }} stroke={axisLine} minTickGap={24} />
            <YAxis tick={{ fill: tick, fontSize: 11 }} stroke={axisLine} width={44} domain={[0, 'auto']} tickFormatter={(v: number) => v.toFixed(1)} />
            <Tooltip formatter={(v) => (typeof v === 'number' ? `${v.toFixed(3)} kWh/L` : v)} />
            {stations.length > 1 && <Legend verticalAlign="bottom" height={28} wrapperStyle={{ fontSize: 12 }} />}
            {stations.map((s, i) => (
              <Line
                key={s.station_name}
                type="monotone"
                dataKey={s.station_name}
                name={s.display_name}
                stroke={colorOf(i)}
                strokeWidth={2}
                dot={{ r: 2.5 }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        Total energy divided by total water for each day (Arizona time). Hours with a stuck or missing energy meter are left out,
        and today is not shown until it is complete.
      </Typography>
    </Paper>
  );
}

function SummaryTile({ station, color }: { station: StationEfficiency; color: string }) {
  const change = efficiencyChange(station.change_pct);
  return (
    <Box sx={{ p: 1.5, minWidth: 180, borderRadius: 2, backgroundColor: 'action.hover', border: '1px solid', borderColor: 'divider', borderLeft: `4px solid ${color}` }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
        {station.display_name.toUpperCase()}
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
        {station.latest != null ? `${station.latest.toFixed(2)} kWh/L` : '—'}
      </Typography>
      <Typography variant="caption" sx={{ color: change.tone === 'good' ? 'success.main' : change.tone === 'bad' ? 'error.main' : 'text.secondary' }}>
        {change.text}
      </Typography>
    </Box>
  );
}
