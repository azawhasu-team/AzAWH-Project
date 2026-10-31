'use client';

import React from 'react';
import { Box, Paper, Typography, Chip, Skeleton, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { useStationWeather } from '@/hooks/queries';
import { groupWeatherEvents } from '@/lib/weatherEvents';
import { formatPhoenixMonthDayTime } from '@/lib/timezone';

const fmt = (v: number | null | undefined, d = 1) => (typeof v === 'number' ? v.toFixed(d) : '—');

/**
 * Recent ambient weather at the station (temperature, humidity, wind, rain,
 * possible dust events) over the last few days: a summary, the rain/dust
 * events, and the hourly values themselves.
 */
export default function WeatherPanel({ stationName, days = 3 }: { stationName: string; days?: number }) {
  const weather = useStationWeather(stationName, days);

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

      <Typography variant="subtitle2" sx={{ fontWeight: 600, mt: 2 }}>
        Hourly values
      </Typography>
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
    </Paper>
  );
}
