'use client';

import React from 'react';
import { Box, Paper, Typography, Chip, Skeleton, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Button, Collapse } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceArea,
  ResponsiveContainer,
} from 'recharts';
import { useStationWeather } from '@/hooks/queries';
import type { WeatherRow } from '@/lib/api-client';
import { groupWeatherEvents, weatherBands } from '@/lib/weatherEvents';
import { formatPhoenixMonthDayTime } from '@/lib/timezone';

const fmt = (v: number | null | undefined, d = 1) => (typeof v === 'number' ? v.toFixed(d) : '—');

interface ChartPoint {
  t: number;
  temp: number | null;
  humidity: number | null;
  wind: number | null;
  gust: number | null;
  pm10: number | null;
}

/** Two small time-series charts (temperature + humidity, wind + dust) with rain/dust periods shaded. */
function WeatherCharts({ rows }: { rows: WeatherRow[] }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const grid = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const tick = isDark ? '#aaa' : '#888';
  const axisLine = isDark ? 'rgba(255,255,255,0.2)' : '#e0e0e0';

  const points: ChartPoint[] = rows.map(r => ({
    t: new Date(r.hour).getTime(),
    temp: r.temperature_c,
    humidity: r.humidity_pct,
    wind: r.wind_kmh,
    gust: r.gust_kmh,
    pm10: r.pm10,
  }));
  const bands = weatherBands(rows);
  const first = points[0]?.t ?? 0;
  const last = points[points.length - 1]?.t ?? 0;

  const xAxis = (
    <XAxis
      dataKey="t"
      type="number"
      scale="time"
      domain={[first, last]}
      tickCount={6}
      tickFormatter={(v: number) => formatPhoenixMonthDayTime(new Date(v))}
      tick={{ fill: tick, fontSize: 11 }}
      stroke={axisLine}
      minTickGap={24}
    />
  );
  const tooltipLabel = (v: unknown) => formatPhoenixMonthDayTime(new Date(Number(v)));
  const shading = bands.map((b, i) => (
    <ReferenceArea
      key={`${b.kind}-${i}`}
      yAxisId="left"
      x1={b.startMs}
      x2={b.endMs}
      fill={b.kind === 'dust_event' ? '#b08d57' : '#42a5f5'}
      fillOpacity={b.kind === 'dust_event' ? 0.28 : 0.16}
      stroke="none"
      ifOverflow="hidden"
    />
  ));
  const legend = <Legend verticalAlign="bottom" height={28} wrapperStyle={{ fontSize: 12 }} />;

  const chart = (title: string, body: React.ReactNode, ariaLabel: string) => (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>{title}</Typography>
      <Box role="img" aria-label={ariaLabel} sx={{ height: 230 }}>
        <ResponsiveContainer width="100%" height="100%">
          {body as React.ReactElement}
        </ResponsiveContainer>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mt: 2 }}>
      {chart(
        'Temperature and humidity',
        <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="4 4" stroke={grid} vertical={false} />
          {xAxis}
          <YAxis yAxisId="left" tick={{ fill: tick, fontSize: 11 }} stroke={axisLine} width={38} unit="°" />
          <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fill: tick, fontSize: 11 }} stroke={axisLine} width={38} unit="%" />
          <Tooltip labelFormatter={tooltipLabel} formatter={(v) => (typeof v === 'number' ? v.toFixed(1) : v)} />
          {legend}
          {shading}
          <Line yAxisId="left" type="monotone" dataKey="temp" name="Temperature (°C)" stroke="#ef6c00" strokeWidth={2} dot={false} connectNulls />
          <Line yAxisId="right" type="monotone" dataKey="humidity" name="Humidity (%)" stroke="#1e88e5" strokeWidth={2} dot={false} connectNulls />
        </ComposedChart>,
        'Hourly temperature and humidity at the station. Shaded periods mark rain or possible dust events.'
      )}
      {chart(
        'Wind and dust',
        <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="4 4" stroke={grid} vertical={false} />
          {xAxis}
          <YAxis yAxisId="left" tick={{ fill: tick, fontSize: 11 }} stroke={axisLine} width={38} />
          <YAxis yAxisId="right" orientation="right" tick={{ fill: tick, fontSize: 11 }} stroke={axisLine} width={38} />
          <Tooltip labelFormatter={tooltipLabel} formatter={(v) => (typeof v === 'number' ? v.toFixed(1) : v)} />
          {legend}
          {shading}
          <Area yAxisId="left" type="monotone" dataKey="gust" name="Gusts (km/h)" stroke="#8e8e8e" fill="#8e8e8e" fillOpacity={0.18} strokeWidth={1} dot={false} connectNulls />
          <Line yAxisId="left" type="monotone" dataKey="wind" name="Wind (km/h)" stroke="#00897b" strokeWidth={2} dot={false} connectNulls />
          <Line yAxisId="right" type="monotone" dataKey="pm10" name="PM10 (µg/m³)" stroke="#b08d57" strokeWidth={2} dot={false} connectNulls />
        </ComposedChart>,
        'Hourly wind speed, gusts and PM10 dust at the station. Shaded periods mark rain or possible dust events.'
      )}
    </Box>
  );
}

/**
 * Recent ambient weather at the station (temperature, humidity, wind, rain,
 * possible dust events) over the last few days: a summary, the rain/dust
 * events, and the hourly values themselves.
 */
export default function WeatherPanel({ stationName, days = 3 }: { stationName: string; days?: number }) {
  const weather = useStationWeather(stationName, days);
  const [showTable, setShowTable] = React.useState(false);

  if (weather.isLoading) return <Skeleton variant="rounded" height={140} sx={{ mb: 2 }} />;
  if (weather.isError || !weather.data || weather.data.data.length === 0) return null;

  const rows = weather.data.data;
  const latest = rows[rows.length - 1];
  const events = groupWeatherEvents(rows);
  const rainHours = rows.filter(r => r.rain).length;
  const dustHours = rows.filter(r => r.dust_event).length;
  const newestFirst = [...rows].reverse();

  return (
    <Paper elevation={0} sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Weather at the station, last {days} days
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Regional hourly data (Open-Meteo), not measured on site
        </Typography>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(auto-fit, minmax(130px, 1fr))' }, gap: 2, mt: 1.5 }}>
        {[
          { label: 'Temperature', value: `${fmt(latest.temperature_c)} °C` },
          { label: 'Humidity', value: `${fmt(latest.humidity_pct, 0)} %` },
          { label: 'Wind', value: `${fmt(latest.wind_kmh, 0)} km/h (gusts ${fmt(latest.gust_kmh, 0)})` },
          { label: 'Now', value: latest.condition },
          { label: 'Rain hours', value: String(rainHours) },
          { label: 'Dust-event hours', value: String(dustHours) },
        ].map(f => (
          <Box key={f.label} sx={{ p: 1.5, borderRadius: 2, backgroundColor: 'action.hover', border: '1px solid', borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              {f.label.toUpperCase()}
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 700 }}>{f.value}</Typography>
          </Box>
        ))}
      </Box>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1.5 }}>
        {events.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No rain or dust events in this period.</Typography>
        ) : (
          events.map(e => (
            <Chip
              key={`${e.kind}-${e.start}`}
              size="small"
              color={e.kind === 'dust_event' ? 'warning' : 'info'}
              label={`${e.kind === 'dust_event' ? 'Dust event' : 'Rain'} · ${formatPhoenixMonthDayTime(new Date(e.start))} · ${e.hours} h`}
            />
          ))
        )}
      </Box>

      <WeatherCharts rows={rows} />

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Hourly values
        </Typography>
        <Button size="small" onClick={() => setShowTable(v => !v)} aria-expanded={showTable} sx={{ textTransform: 'none' }}>
          {showTable ? 'Hide table' : 'Show table'}
        </Button>
      </Box>
      <Collapse in={showTable} unmountOnExit>
      <TableContainer sx={{ maxHeight: 360, mt: 0.5 }}>
        <Table size="small" stickyHeader aria-label="Hourly weather">
          <TableHead>
            <TableRow>
              <TableCell>Time (Arizona)</TableCell>
              <TableCell align="right">Temp (°C)</TableCell>
              <TableCell align="right">Humidity (%)</TableCell>
              <TableCell align="right">Wind (km/h)</TableCell>
              <TableCell align="right">Gusts (km/h)</TableCell>
              <TableCell align="right">Precip (mm)</TableCell>
              <TableCell align="right">PM10 (µg/m³)</TableCell>
              <TableCell>Condition</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {newestFirst.map(r => (
              <TableRow key={r.hour} hover>
                <TableCell>{formatPhoenixMonthDayTime(new Date(r.hour))}</TableCell>
                <TableCell align="right">{fmt(r.temperature_c)}</TableCell>
                <TableCell align="right">{fmt(r.humidity_pct, 0)}</TableCell>
                <TableCell align="right">{fmt(r.wind_kmh)}</TableCell>
                <TableCell align="right">{fmt(r.gust_kmh)}</TableCell>
                <TableCell align="right">{fmt(r.precip_mm)}</TableCell>
                <TableCell align="right">{fmt(r.pm10)}</TableCell>
                <TableCell>{r.condition}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      </Collapse>
    </Paper>
  );
}
