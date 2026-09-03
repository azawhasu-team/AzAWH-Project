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

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2.5, sm: 3.5 },
        mt: { xs: 2, sm: 3 },
        borderRadius: 3,
        border: '1px solid rgba(30,136,229,0.15)',
        background: 'linear-gradient(145deg, #ffffff 0%, #f8fbff 100%)',
        boxShadow: '0 8px 32px rgba(30,136,229,0.08)',
        overflow: 'hidden',
        position: 'relative',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '4px',
          background: 'linear-gradient(90deg, #1e88e5, #e91e63)',
          borderRadius: '3px 3px 0 0',
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography
            variant="h5"
            sx={{
              fontSize: { xs: '1.1rem', sm: '1.35rem', md: '1.55rem' },
              fontWeight: 700,
              background: 'linear-gradient(90deg, #1e88e5, #b8336a)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              mb: 0.5,
            }}
          >
            {feature}
          </Typography>
          <Typography variant="caption" sx={{ color: '#888', fontWeight: 500 }}>
            {startDate} → {endDate} &nbsp;·&nbsp; {data.length.toLocaleString()} readings
          </Typography>
        </Box>
      </Box>
      
      {data.length === 0 ? (
        <Box 
          display="flex" 
          justifyContent="center" 
          alignItems="center" 
          height={{ xs: 400, sm: 500, md: 600 }}
        >
          <Typography variant="body1" color="text.secondary">
            No data available for the selected date range
          </Typography>
        </Box>
      ) : (
        <Box sx={{ width: '100%', height: { xs: 380, sm: 460, md: 520, lg: 560 }, minHeight: 380 }}>
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
              <CartesianGrid strokeDasharray="4 4" stroke="rgba(0,0,0,0.06)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                stroke="#bbb"
                interval={tickInterval}
                angle={-35}
                textAnchor="end"
                height={60}
                tick={{ fontSize: 11, fill: '#888' }}
                axisLine={{ stroke: '#e0e0e0' }}
                tickLine={false}
              />
              <YAxis
                yAxisId="left"
                stroke="#bbb"
                tickFormatter={(v: number) => unit1 ? `${typeof v === 'number' ? Number(v).toFixed(1) : v} ${unit1}` : String(v)}
                label={{
                  value: unit1 || param1Name,
                  angle: -90,
                  position: 'insideLeft',
                  offset: -5,
                  style: { fill: '#1e88e5', fontSize: '12px', fontWeight: 600 }
                }}
                width={unit1 ? 75 : 60}
                tick={{ fontSize: 11, fill: '#888' }}
                axisLine={false}
                tickLine={false}
              />
              {hasSecondParam && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#bbb"
                  tickFormatter={(v: number) => unit2 ? `${typeof v === 'number' ? Number(v).toFixed(1) : v} ${unit2}` : String(v)}
                  label={{
                    value: unit2 || param2Name,
                    angle: 90,
                    position: 'insideRight',
                    offset: 5,
                    style: { fill: '#e91e63', fontSize: '12px', fontWeight: 600 }
                  }}
                  width={unit2 ? 75 : 60}
                  tick={{ fontSize: 11, fill: '#888' }}
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
                  backgroundColor: 'rgba(255,255,255,0.97)',
                  border: '1px solid rgba(30,136,229,0.2)',
                  borderRadius: '10px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  padding: '10px 14px',
                  fontSize: '13px',
                }}
                labelStyle={{ fontWeight: 700, color: '#333', marginBottom: 4 }}
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