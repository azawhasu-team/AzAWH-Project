'use client';

import React from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceArea,
  ResponsiveContainer,
} from 'recharts';
import { Box, Typography, Paper, Button } from '@mui/material';
import { ZoomOutMap } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { FeatureType, ChartDataPoint } from '@/types';
import { formatPhoenixTime, formatPhoenixFullDateTime, phoenixDateKey } from '@/lib/timezone';
import { downsampleMinMax } from '@/lib/downsample';

interface FeaturePlotProps {
  data: ChartDataPoint[];
  feature: FeatureType;
  startDate: string;
  endDate: string;
  paramNames?: string[];
  paramUnits?: string[];
  /** 'area' (default) for continuous raw-reading series; 'bar' for discrete
   * hourly-aggregated series, where each point is its own hour's value rather
   * than a sample of a continuous signal. */
  chartType?: 'area' | 'bar';
}

const FeaturePlot: React.FC<FeaturePlotProps> = ({ data, feature, startDate, endDate, paramNames, paramUnits, chartType = 'area' }) => {
  const isBar = chartType === 'bar';
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  // On phones the axes' width and rotated titles eat a third of the plot.
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
  // recharts exports AreaChart/BarChart as distinct components, but both
  // accept the same axis/grid/tooltip/legend children — swapping just the
  // container (and the Area/Bar series below) is enough to switch chart types.
  const ChartContainer = isBar ? BarChart : AreaChart;
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

  // Drag-to-zoom (continuous charts only). Zooming re-downsamples from the
  // full series, so a zoomed-in view shows real detail rather than a
  // magnified copy of the coarse overview. The zoom is tied to the `data`
  // array it was made on, so applying a new date range resets it.
  const [zoomState, setZoomState] = React.useState<{ data: ChartDataPoint[]; start: number; end: number } | null>(null);
  const [dragLeft, setDragLeft] = React.useState<string | null>(null);
  const [dragRight, setDragRight] = React.useState<string | null>(null);
  const zoom = zoomState && zoomState.data === data ? zoomState : null;
  const canZoom = !isBar;

  const visibleData = React.useMemo(
    () =>
      zoom
        ? data.filter(d => {
            const t = new Date(d.date).getTime();
            return t >= zoom.start && t <= zoom.end;
          })
        : data,
    [data, zoom]
  );

  const MAX_POINTS = 500;
  // Peak-preserving downsample (see lib/downsample.ts) — plain every-Nth-point
  // sampling can drop an isolated spike, which is what this chart must show.
  const plotData = React.useMemo(() => downsampleMinMax(visibleData, MAX_POINTS), [visibleData]);

  const commitDrag = () => {
    if (dragLeft && dragRight && dragLeft !== dragRight) {
      const a = new Date(dragLeft).getTime();
      const b = new Date(dragRight).getTime();
      setZoomState({ data, start: Math.min(a, b), end: Math.max(a, b) });
    }
    setDragLeft(null);
    setDragRight(null);
  };

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
    // ~12 rotated labels fit a desktop chart; on a phone they overlap into a smear.
    return Math.floor(plotData.length / (isPhone ? 4 : 12));
  }, [plotData, isPhone]);
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
            {plotData.length < visibleData.length &&
              ` · showing ${plotData.length.toLocaleString()} points, peaks preserved`}
          </Typography>
        </Box>
        {canZoom && (
          zoom ? (
            <Button size="small" startIcon={<ZoomOutMap />} onClick={() => setZoomState(null)}>
              Reset zoom ({visibleData.length.toLocaleString()} readings)
            </Button>
          ) : (
            data.length > 20 && (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Drag across the chart to zoom
              </Typography>
            )
          )
        )}
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
            <ChartContainer
              data={plotData}
              margin={{ top: 10, right: hasSecondParam ? (isPhone ? 10 : 70) : 20, left: isPhone ? 0 : 10, bottom: 60 }}
              onMouseDown={canZoom ? (e) => e?.activeLabel != null && setDragLeft(String(e.activeLabel)) : undefined}
              onMouseMove={canZoom && dragLeft ? (e) => e?.activeLabel != null && setDragRight(String(e.activeLabel)) : undefined}
              onMouseUp={canZoom ? commitDrag : undefined}
              onMouseLeave={canZoom ? () => { setDragLeft(null); setDragRight(null); } : undefined}
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
                label={isPhone ? undefined : {
                  value: unit1 || param1Name,
                  angle: -90,
                  position: 'insideLeft',
                  offset: -5,
                  style: { fill: '#1e88e5', fontSize: '12px', fontWeight: 600 }
                }}
                width={isPhone ? 52 : unit1 ? 75 : 60}
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
                  label={isPhone ? undefined : {
                    value: unit2 || param2Name,
                    angle: 90,
                    position: 'insideRight',
                    offset: 5,
                    style: { fill: '#e91e63', fontSize: '12px', fontWeight: 600 }
                  }}
                  width={isPhone ? 52 : unit2 ? 75 : 60}
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
              {isBar ? (
                <Bar
                  yAxisId="left"
                  dataKey="value"
                  fill="#1e88e5"
                  radius={[3, 3, 0, 0]}
                  name={param1Name}
                />
              ) : (
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
              )}
              {hasSecondParam && (
                isBar ? (
                  <Bar
                    yAxisId="right"
                    dataKey="value2"
                    fill="#e91e63"
                    radius={[3, 3, 0, 0]}
                    name={param2Name}
                  />
                ) : (
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
                )
              )}
              {canZoom && dragLeft && dragRight && (
                <ReferenceArea yAxisId="left" x1={dragLeft} x2={dragRight} strokeOpacity={0.3} fill="#1e88e5" fillOpacity={0.12} />
              )}
            </ChartContainer>
          </ResponsiveContainer>
        </Box>
      )}
    </Paper>
  );
};

export default FeaturePlot;