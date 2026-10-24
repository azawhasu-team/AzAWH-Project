'use client';

import React from 'react';
import { Box, Paper, Typography, Chip, Skeleton, Tooltip } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { useStationQuality } from '@/hooks/queries';
import { QUALITY_COLOR, describeIssues, lastCalibrationDate } from '@/lib/dataQuality';

/**
 * "Can I trust this station's data?" — a daily score strip plus the problems
 * behind the latest bad days, and the recalibration dates, so a step change in
 * a chart can be told apart from real drift.
 */
export default function DataQualityPanel({ stationName, days = 14 }: { stationName: string; days?: number }) {
  const theme = useTheme();
  const { data, isLoading, isError } = useStationQuality(stationName, days);

  if (isLoading) return <Skeleton variant="rounded" height={110} sx={{ mb: 2 }} />;
  if (isError || !data || data.days.length === 0) return null; // nothing to judge, say nothing

  const worst = [...data.days].reverse().find((d) => d.label !== 'good');
  const lastCal = lastCalibrationDate(data.calibrations);

  return (
    <Paper elevation={0} sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Data quality, last {data.days.length} days
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Score = hours reported, minus penalties for frozen, dead or impossible sensor values
        </Typography>
      </Box>

      <Box role="list" aria-label="Daily data quality" sx={{ display: 'flex', gap: 0.5, mt: 1.5, flexWrap: 'wrap' }}>
        {data.days.map((d) => {
          const color = theme.palette[QUALITY_COLOR[d.label]].main;
          const calibrated = data.calibrations.filter((c) => c.date === d.date);
          return (
            <Tooltip
              key={d.date}
              arrow
              title={
                <>
                  <strong>
                    {d.date}: {d.score}/100 ({d.label})
                  </strong>
                  {describeIssues(d).map((l) => (
                    <div key={l}>{l}</div>
                  ))}
                  {calibrated.map((c) => (
                    <div key={c.id}>Recalibrated: {c.sensor}</div>
                  ))}
                </>
              }
            >
              <Box
                role="listitem"
                aria-label={`${d.date}: quality ${d.score} out of 100, ${d.label}`}
                sx={{
                  width: 44,
                  py: 0.5,
                  textAlign: 'center',
                  borderRadius: 0.5,
                  bgcolor: alpha(color, 0.18),
                  border: '1px solid',
                  borderColor: calibrated.length ? 'primary.main' : alpha(color, 0.5),
                  borderWidth: calibrated.length ? 2 : 1,
                }}
              >
                <Typography sx={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>{d.score}</Typography>
                <Typography sx={{ fontSize: 10, color: 'text.secondary', lineHeight: 1.2 }}>{d.date.slice(5)}</Typography>
              </Box>
            </Tooltip>
          );
        })}
      </Box>

      {worst ? (
        <Typography variant="body2" sx={{ mt: 1.5 }}>
          Latest problem day, {worst.date}:{' '}
          {describeIssues(worst).join('; ') || 'low coverage'}.
        </Typography>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          No data-quality problems in this period.
        </Typography>
      )}

      {data.calibrations.length > 0 && (
        <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            Recalibrations{lastCal ? ` (latest ${lastCal})` : ''}:
          </Typography>
          {data.calibrations.slice(0, 6).map((c) => (
            <Chip key={c.id} size="small" variant="outlined" label={`${c.date} · ${c.sensor}`} title={c.note || undefined} />
          ))}
        </Box>
      )}
    </Paper>
  );
}
