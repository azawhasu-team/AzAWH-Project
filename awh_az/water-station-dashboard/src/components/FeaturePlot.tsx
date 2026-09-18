'use client';

import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Box, Typography, Paper } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { FeatureType, ChartDataPoint } from '@/types';
import { formatPhoenixTime, formatPhoenixFullDateTime, phoenixDateKey } from '@/lib/timezone';

interface FeaturePlotProps {
  data: ChartDataPoint[];
  feature: FeatureType;
  startDate: string;
  endDate: string;
  paramNames?: string[];
  paramUnits?: string[];
}

const FeaturePlot: React.FC<FeaturePlotProps> = ({ data, feature, startDate, endDate, paramNames, paramUnits }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  // Recharts takes literal color strings, not MUI theme tokens.
  const chartGridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const chartAxisStroke = isDark ? '#777' : '#bbb';
  const chartAxisLineColor = isDark ? 'rgba(255,255,255,0.2)' : '#e0e0e0';
  const chartTickColor = isDark ? '#aaa' : '#888';
  const hasSecondParam = data.length > 0 && data[0].value2 !== undefined;
  const param1Name = paramNames?.[0] || feature;
  const param2Name = paramNames?.[1] || 'Parameter 2';
  const unit1 = paramUnits?.[0] || '';
  const unit2 = paramUnits?.[1] || '';

  // Downsample data if too many points for clean rendering
  const plotData = React.useMemo(() => {
    const MAX_POINTS = 500;
    if (data.length <= MAX_POINTS) return data;
    const step = Math.ceil(data.length / MAX_POINTS);
    return data.filter((_, i) => i % step === 0 || i === data.length - 1);
  }, [data]);

  // Determine if data spans multiple days (in Phoenix time) to choose date vs time formatting
  const spansMultipleDays = React.useMemo(() => {
    if (plotData.length < 2) return false;
    const first = new Date(plotData[0].date);
    const last = new Date(plotData[plotData.length - 1].date);
    return phoenixDateKey(first) !== phoenixDateKey(last);
  }, [plotData]);

  // Compute tick interval: aim for ~10-15 ticks on x-axis
  const tickInterval = React.useMemo(() => {
    if (plotData.length <= 15) return 0;
    return Math.floor(plotData.length / 12);
  }, [plotData]);
  const getFeatureUnit = (feature: FeatureType): string => {
    switch (feature) {
      case 'Temperature':
        return '°C';
      case 'Humidity':
        return '%';
      case 'Population':
        return 'people';
      case 'Water Production':
        return 'L/hr';
      case 'pH Level':
        return 'pH';
      default:
        return '';
    }
  };

  const getFeatureColor = (feature: FeatureType): string => {
    switch (feature) {
      case 'Temperature':
        return '#ff6b35';
      case 'Humidity':
        return '#004e89';
      case 'Population':
        return '#7209b7';
      case 'Water Production':
        return '#1976d2';
      case 'pH Level':
        return '#2e7d32';
      default:
        return '#1976d2';
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const time = formatPhoenixTime(date);
    if (spansMultipleDays) {
      const monthDay = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Phoenix',
        month: 'numeric',
        day: 'numeric',
      }).format(date);
      return `${monthDay} ${time}`;
    }
    return time;
  };

  const formatTooltipLabel = (label: string) => formatPhoenixFullDateTime(new Date(label));

  // A flat/near-empty line still needs enough height to read as a chart, but
  // a fixed 380-560px made every panel dominate the page even when the
  // selected range has only a handful of points. Scale height down for
  // small datasets instead.
  const chartHeight = plotData.length === 0
    ? { xs: 200, sm: 240 }
    : plotData.length < 20
      ? { xs: 260, sm: 300 }
      : { xs: 300, sm: 340, md: 380 };

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2, sm: 2.75 },
        mt: { xs: 1.5, sm: 2 },
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        background: 'background.paper',
        boxShadow: (t) => t.palette.mode === 'dark' ? '0 1px 3px rgba(0,0,0,0.3)' : '0 1px 3px rgba(15, 23, 42, 0.06)',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography
            variant="h6"
            sx={{
              fontSize: { xs: '0.95rem', sm: '1.05rem' },
              fontWeight: 700,
              color: 'text.primary',
              mb: 0.25,
            }}
          >
            {feature}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
            {startDate} → {endDate} &nbsp;·&nbsp; {data.length.toLocaleString()} readings
          </Typography>
        </Box>
      </Box>

      {data.length === 0 ? (
        <Box
          display="flex"
          justifyContent="center"
          alignItems="center"
          height={chartHeight}
        >
          <Typography variant="body1" color="text.secondary">
            No data available for the selected date range
          </Typography>
        </Box>
      ) : (
        <Box sx={{ width: '100%', height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={plotData}
              margin={{ top: 10, right: hasSecondParam ? 70 : 20, left: 10, bottom: 60 }}
            >
              <defs>
                <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1e88e5" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#1e88e5" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="grad2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#e91e63" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#e91e63" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" stroke={chartGridColor} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                stroke={chartAxisStroke}
                interval={tickInterval}
                angle={-35}
                textAnchor="end"
                height={60}
                tick={{ fontSize: 11, fill: chartTickColor }}
                axisLine={{ stroke: chartAxisLineColor }}
                tickLine={false}
              />
              <YAxis
                yAxisId="left"
                stroke={chartAxisStroke}
                tickFormatter={(v: number) => unit1 ? `${typeof v === 'number' ? Number(v).toFixed(1) : v} ${unit1}` : String(v)}
                label={{
                  value: unit1 || param1Name,
                  angle: -90,
                  position: 'insideLeft',
                  offset: -5,
                  style: { fill: '#1e88e5', fontSize: '12px', fontWeight: 600 }
                }}
                width={unit1 ? 75 : 60}
                tick={{ fontSize: 11, fill: chartTickColor }}
                axisLine={false}
                tickLine={false}
              />
              {hasSecondParam && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke={chartAxisStroke}
                  tickFormatter={(v: number) => unit2 ? `${typeof v === 'number' ? Number(v).toFixed(1) : v} ${unit2}` : String(v)}
                  label={{
                    value: unit2 || param2Name,
                    angle: 90,
                    position: 'insideRight',
                    offset: 5,
                    style: { fill: '#e91e63', fontSize: '12px', fontWeight: 600 }
                  }}
                  width={unit2 ? 75 : 60}
                  tick={{ fontSize: 11, fill: chartTickColor }}
                  axisLine={false}
                  tickLine={false}
                />
              )}
              <Tooltip
                labelFormatter={formatTooltipLabel}
                formatter={(value: number | string, name: string) => {
                  if (value == null) return ['No reading this hour', name];
                  const unit = name === param2Name ? unit2 : unit1;
                  const formatted = typeof value === 'number' ? Number(value).toFixed(3) : value;
                  return [`${formatted}${unit ? ' ' + unit : ''}`, name];
                }}
                contentStyle={{
                  backgroundColor: isDark ? 'rgba(30,30,30,0.97)' : 'rgba(255,255,255,0.97)',
                  border: '1px solid rgba(30,136,229,0.2)',
                  borderRadius: '10px',
                  boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.5)' : '0 8px 24px rgba(0,0,0,0.12)',
                  padding: '10px 14px',
                  fontSize: '13px',
                }}
                labelStyle={{ fontWeight: 700, color: isDark ? '#eee' : '#333', marginBottom: 4 }}
                cursor={{ stroke: 'rgba(30,136,229,0.3)', strokeWidth: 1, strokeDasharray: '4 4' }}
              />
              <Legend
                wrapperStyle={{ paddingTop: '12px', fontSize: '13px', fontWeight: 600 }}
                iconType="circle"
                iconSize={10}
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="value"
                stroke="#1e88e5"
                strokeWidth={2}
                fill="url(#grad1)"
                dot={false}
                activeDot={{ r: 5, fill: '#1e88e5', stroke: 'white', strokeWidth: 2 }}
                name={param1Name}
              />
              {hasSecondParam && (
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="value2"
                  stroke="#e91e63"
                  strokeWidth={2}
                  fill="url(#grad2)"
                  dot={false}
                  activeDot={{ r: 5, fill: '#e91e63', stroke: 'white', strokeWidth: 2 }}
                  name={param2Name}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </Box>
      )}
    </Paper>
  );
};

export default FeaturePlot;